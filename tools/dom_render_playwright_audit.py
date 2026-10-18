#!/usr/bin/env python
"""Local DOM/render audit for public Void Scriptor routes."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ROUTES = [
    ("home", "/index.html"), ("qowner", "/qowner.html"),
    ("dashboard", "/dashboard.html"), ("docs", "/docs/index.html"),
    ("status", "/status.html"), ("changelog", "/changelog.html"),
]
VIEWPORTS = [("desktop", 1280, 720), ("mobile", 390, 844)]

def serve():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *_): pass
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Quiet)
    server.daemon_threads = True
    Thread(target=server.serve_forever, daemon=True).start()
    return server

def contrast_probe(page):
    return page.evaluate("""() => {
      const rgb = s => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
        const a = m[1].split(',').map(Number); return [a[0],a[1],a[2],a[3] ?? 1]; };
      const lin = c => { c/=255; return c<=.03928 ? c/12.92 : ((c+.055)/1.055)**2.4; };
      const lum = c => .2126*lin(c[0])+.7152*lin(c[1])+.0722*lin(c[2]);
      const ratio = (a,b) => (Math.max(lum(a),lum(b)+.05))/(Math.min(lum(a),lum(b)+.05));
      const bg = el => { for (let n=el;n;n=n.parentElement) { const s=getComputedStyle(n);
        const c=rgb(s.backgroundColor); if(c && c[3]>.9) return {c, image:s.backgroundImage!== 'none'}; }
        return {c:[255,255,255,1],image:false}; };
      const out=[]; for (const el of document.querySelectorAll('a,button,h1,h2,h3,p,[role="button"]')) {
        const text=(el.innerText||'').trim().replace(/\\s+/g,' '); const r=el.getBoundingClientRect();
        const s=getComputedStyle(el); if(!text||r.width<1||r.height<1||s.display==='none'||s.visibility==='hidden') continue;
        const fg=rgb(s.color), back=bg(el); if(!fg) continue; const q=(Math.max(lum(fg),lum(back.c))+.05)/(Math.min(lum(fg),lum(back.c))+.05);
        const large=parseFloat(s.fontSize)>=24 || (parseFloat(s.fontSize)>=18.66 && +s.fontWeight>=700); const need=large?3:4.5;
        if(q<need && !back.image && !getComputedStyle(el).backgroundImage.includes('gradient')) out.push({text:text.slice(0,80),tag:el.tagName,ratio:+q.toFixed(2),need,fg:s.color,bg:back.c.slice(0,3).join(',')});
      } return out;
    }""")

def main():
    server = serve(); base=f"http://127.0.0.1:{server.server_port}"
    result={"routes":len(ROUTES),"viewports":len(VIEWPORTS),"pages":[],"contrast_failures":[]}
    errors=[]
    with sync_playwright() as pw:
      browser=pw.chromium.launch(headless=True, executable_path=os.path.join(os.environ["LOCALAPPDATA"], "ms-playwright", "chromium_headless_shell-1243", "chrome-headless-shell-win64", "chrome-headless-shell.exe"))
      for name,path in ROUTES:
        for vp,w,h in VIEWPORTS:
          page=browser.new_page(viewport={"width":w,"height":h})
          console_errors=[]; page.on("pageerror", lambda e: console_errors.append(str(e)))
          response=page.goto(base+path, wait_until="networkidle")
          page.wait_for_timeout(150)
          overflow=page.evaluate("document.documentElement.scrollWidth === document.documentElement.clientWidth")
          row={"route":name,"path":path,"viewport":vp,"status":response.status if response else None,"overflow_ok":overflow,"page_errors":len(console_errors)}
          if not overflow: errors.append(f"{name}/{vp}: horizontal overflow")
          if console_errors: errors.append(f"{name}/{vp}: {len(console_errors)} page errors")
          fails=contrast_probe(page); result["contrast_failures"].extend([{**x,"route":name,"viewport":vp} for x in fails])
          if vp=="mobile" and name=="home":
            page.locator("#hamb").click(); page.wait_for_timeout(50)
            row["menu"] = page.evaluate("""() => { const n=document.querySelector('#nav'), b=document.querySelector('#hamb'); const r=n.getBoundingClientRect(); return {open:n.classList.contains('open'), expanded:b.getAttribute('aria-expanded'), visible:getComputedStyle(n).display!=='none', within:r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}; }""")
            if not all(row["menu"].get(k) for k in ("open","visible","within")) or row["menu"].get("expanded") != "true": errors.append("home/mobile: responsive menu failed open/fit contract")
          result["pages"].append(row); page.close()
      browser.close()
    result["errors"]=errors
    print(json.dumps(result, indent=2))
    if errors or result["contrast_failures"]: return 1
    return 0

if __name__ == "__main__": sys.exit(main())
