# Changelog

The RsHtml Extension.

## [0.1.4]

### Changed

- **System Binary Detection And Robust Installation:** The language server download and installation process has been rewritten
to take advantage of the system setup.
The extension will now prioritize using a globally installed
`rshtml-analyzer` if it is found in the `system PATH`,
allowing users to manage their own toolchains.
If it is not found in the `system PATH`,
the extension will automatically handle downloading and updating the analyzer
in the background.

- **Workspace-Scoped Settings:** The `files.associations` setting for `.rs.html` files is now applied at the Workspace level instead of Globally, preventing unintended changes to the user's global configuration.

### Features

- Language server support for Windows, macOS, and Linux.
- Basic syntax highlighting for `.rs.html` files.
- Provides diagnostics for errors and code suggestions.
