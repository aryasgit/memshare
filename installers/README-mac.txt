MEMSHARE — macOS
================

What's in this zip
------------------
  memshare-mac.command   Double-clickable installer / launcher.
  README.txt             This file.

Prerequisites
-------------
  • Node.js 20 or newer    — https://nodejs.org
  • git                    — included with the Xcode command-line tools
                             (run `xcode-select --install` if missing)

If you don't have these, the installer will tell you exactly what to
do when you run it.

How to use it
-------------
  1. Double-click memshare-mac.command.
  2. The first time, macOS may say "cannot be opened because it is
     from an unidentified developer". Two ways past that:
       • Right-click the file → Open → confirm.
       • Or in System Settings → Privacy & Security, click "Open Anyway".
  3. The installer clones Memshare to ~/Memshare, installs dependencies
     (once), and starts the server in local mode.
  4. Your browser opens http://localhost:8787 automatically.
  5. Click "Start a new room", share the URL or the room code with a
     teammate on the same Wi-Fi.

To stop, close the Terminal window or press Control-C.

To upgrade, just double-click the file again — it pulls the latest
commits before launching.

Uninstall
---------
  rm -rf ~/Memshare
  rm memshare-mac.command

Project
-------
  https://github.com/aryasgit/memshare
