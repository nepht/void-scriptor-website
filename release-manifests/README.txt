Void Scriptor release manifests

The SHA-256 file in this directory is a static, no-JavaScript fallback for the
public release page. A matching SHA-256 proves that downloaded bytes match the
published digest; it does not by itself prove provenance, publisher identity,
or code signing.

Current public preview:
  VoidScriptor-1.2.0-rc.2-windows-x64-setup.exe

The RC.2 installer currently carries a timestamped Authenticode signature
from a self-issued certificate. This helps detect changes after signing, but
does not establish a publicly trusted publisher identity or SmartScreen trust.

The portable ZIP is published through the same release storage and has its
own static manifest:
  /release-manifests/voidscriptor-1.2.0-rc.1-windows-x64.zip.sha256
The portable ZIP remains an RC.1 artifact while RC.2 is currently available
as the Windows installer only.
A matching ZIP SHA-256 proves the downloaded archive bytes match the published
digest; it does not by itself prove provenance, publisher identity, or code
signing. CHECKSUMS.txt inside the ZIP verifies the 494 application payload
members; it does not verify the ZIP itself.
