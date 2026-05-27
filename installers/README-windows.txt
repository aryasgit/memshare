MEMSHARE — Windows
==================

What's in this zip
------------------
  memshare-windows.bat   Double-clickable installer / launcher.
  README.txt             This file.

Prerequisites
-------------
  * Node.js 20 or newer    https://nodejs.org
  * Git for Windows         https://git-scm.com/download/win

If you don't have these, the installer will tell you exactly what to
do when you run it.

How to use it
-------------
  1. Double-click memshare-windows.bat.
  2. The first time, SmartScreen may warn "Windows protected your PC".
     Click "More info" then "Run anyway".
  3. The installer clones Memshare to %USERPROFILE%\Memshare, installs
     dependencies (once), and starts the server in local mode.
  4. Your browser opens http://localhost:8787 automatically.
  5. Click "Start a new room", share the URL or the room code with a
     teammate on the same Wi-Fi.

To stop, close the cmd window.

To upgrade, just double-click the file again - it pulls the latest
commits before launching.

Uninstall
---------
  rmdir /s /q "%USERPROFILE%\Memshare"
  del memshare-windows.bat

Project
-------
  https://github.com/aryasgit/memshare
