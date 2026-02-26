# SF Pro Font Installation

This directory should contain the Apple SF Pro font files for the application.

## Downloading SF Pro Fonts

1. Visit Apple's official fonts page: https://developer.apple.com/fonts/
2. Download "SF Pro" font package
3. Extract the downloaded package
4. Convert the fonts to `.woff2` format (if needed) using a tool like:
   - https://cloudconvert.com/ttf-to-woff2
   - Or use `woff2_compress` CLI tool

## Required Font Files

Place the following `.woff2` files in this directory:

```
fonts/
├── SF-Pro-Display-Regular.woff2
├── SF-Pro-Display-Medium.woff2
├── SF-Pro-Display-Semibold.woff2
├── SF-Pro-Display-Bold.woff2
├── SF-Pro-Text-Regular.woff2
├── SF-Pro-Text-Medium.woff2
├── SF-Pro-Text-Semibold.woff2
└── SF-Mono-Regular.woff2
```

## Fallback Fonts

If SF Pro fonts are not installed, the system will fall back to:
- `-apple-system` (macOS/iOS)
- `BlinkMacSystemFont` (Chrome on macOS)
- `Helvetica Neue`
- `Helvetica`
- `Arial`
- `sans-serif`

## License

SF Pro fonts are proprietary Apple fonts. They are free to use in applications but must be downloaded from Apple's official sources.
