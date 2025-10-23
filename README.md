# RsHtml for Visual Studio Code

[![Visual Studio Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/rshtml.rshtml?style=for-the-badge&label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=rshtml.rshtml)
[![Open VSX Registry](https://img.shields.io/open-vsx/v/rshtml/rshtml?style=for-the-badge&label=Open%20VSX)](https://open-vsx.org/extension/rshtml/rshtml)

This extension provides official language server support for the [RsHtml](https://github.com/rshtml/rshtml) templating engine in Visual Studio Code.

## Features

*   **Language Server:** Integrates the RsHtml language server to provide rich language features.
*   **Syntax Highlighting:** Basic syntax highlighting for `.rs.html` files.
*   **Cross-Platform Support:** The language server works seamlessly on Windows, macOS, and Linux.

## Overview

This extension is a lightweight wrapper that automatically starts the RsHtml language server for you, enabling a smoother development experience when working with RsHtml templates.

## Getting Started

1.  **Install the Extension:** Install "RsHtml" from your preferred marketplace:
    *   [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rshtml.rshtml)
    *   [Open VSX Registry](https://open-vsx.org/extension/rshtml/rshtml)

2.  **Language Server Management:** This extension requires the `rshtml-analyzer` language server to provide language features. The extension handles this for you automatically:
    *   If you have `rshtml-analyzer` already installed and available in your system's `PATH`, the extension will use your existing version. This is ideal for users who prefer to manage their own toolchains.
        The server can be downloaded from the [releases](https://github.com/rshtml/rshtml-analyzer/releases) page or use the command below:

        ```sh
        cargo install --git https://github.com/rshtml/rshtml-analyzer.git --tag v0.1.5
        ```
    *   If the server is not found in your `PATH`, the extension will seamlessly download and manage the latest compatible version for your operating system in the background. This provides a zero-configuration experience.

3.  **Start Coding:** Open a project containing `.rs.html` files to automatically activate the language features.

---

**Enjoy working with RsHtml!**
