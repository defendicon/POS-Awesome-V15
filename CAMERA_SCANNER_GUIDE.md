# Enhanced Camera Scanner with OpenCV

Advanced barcode and QR code scanner with real-time image processing for POSAwesome.

## Features

### High-Quality Camera Processing
- **High Resolution**: Supports up to 1920x1080 (Full HD) with minimum 1280x720
- **Rear Camera Preference**: Automatically selects environment-facing camera for better barcode scanning
- **Advanced Constraints**: Continuous autofocus, exposure, and white balance control
- **Enhanced Mode**: Specialized settings for dark/black barcodes and difficult scanning conditions

### OpenCV Image Processing Pipeline (Web Worker)
Real-time image enhancement using OpenCV.js in a separate Web Worker to prevent UI blocking:

- **Non-Blocking Processing**: Heavy image processing runs in Web Worker thread
- **Local Loading**: OpenCV.js loads from local bundle for reliability and speed
- **Gaussian Blur**: Light noise reduction (3x3 kernel for speed)
- **Adaptive Thresholding**: Better contrast for varying lighting conditions
- **Unsharp Masking**: Advanced sharpening technique for edge enhancement
- **Morphological Operations**: Light image cleanup (3x3 kernel for speed)

### Multiple Processing Modes
1. **Quick Process**: Real-time processing with essential filters (default)
2. **Full Process**: Complete pipeline for damaged or low-contrast barcodes
3. **Fallback Mode**: Basic processing when device constraints are not supported

## Scanner Controls

### Camera Settings
- **Enhanced Camera Mode**: Always uses optimized camera settings for best performance
- **High-Quality Constraints**: Full HD resolution with enhanced contrast, brightness, and sharpness

### OpenCV Processing Toggle
- **OpenCV On**: Real-time image preprocessing enabled (recommended)
- **OpenCV Off**: Basic scanning without image enhancement

### Hardware Controls
- **Flash/Torch**: Toggle camera flash for low-light scanning
- **Camera Switch**: Switch between front and rear cameras if multiple available

## Supported Barcode Formats

- QR Code
- EAN-13, EAN-8
- Code 128, Code 39, Code 93
- UPC-A, UPC-E
- Codabar
- ITF (Interleaved 2 of 5)

## HTTPS Requirements

### Security Context
- **HTTPS Required**: Camera access requires secure context (HTTPS protocol)
- **SSL Certificate**: Ensure valid SSL certificate is installed
- **Mixed Content**: Avoid loading scanner over HTTP on HTTPS sites

### Browser Compatibility
- **Chrome/Edge**: Full feature support
- **Firefox**: Good support for most features
- **Safari**: Basic support (some advanced constraints may not work)
- **Mobile Browsers**: Optimized for mobile device cameras

## Usage Instructions

### Initial Setup
1. Ensure site is served over HTTPS
2. Grant camera permission when prompted
3. Point camera at barcode/QR code within the scanning frame
4. Use controls to optimize for specific scanning conditions

### For Difficult Barcodes
1. **OpenCV Processing** is automatically optimized for dark/black barcodes
2. Use **Flash** in low-light conditions
3. Try different **Camera** angles or distances
4. Hold steady for better focus

### Performance Optimization
- **Web Worker Processing**: Heavy OpenCV operations run in separate thread, keeping UI responsive
- **Local Loading**: OpenCV.js loads from local bundle for fast, reliable initialization
- **Frame Skipping**: Only processes every 3rd frame to prevent queue buildup
- **Processing Lock**: Prevents multiple simultaneous operations
- **Enhanced Camera Settings**: Always uses best available camera constraints
- **Automatic Fallback**: Gracefully handles worker failures and initialization issues

## Error Handling

### Common Issues and Solutions

**Camera Permission Denied**
```
Solution: Allow camera access in browser settings and refresh page
```

**No Camera Found**
```
Solution: Ensure device has working camera and no other apps are using it
```

**HTTPS Required**
```
Solution: Access the application over HTTPS instead of HTTP
```

**Constraints Not Supported**
```
Solution: Scanner will automatically try fallback settings
```

## API Integration

### Component Events
```javascript
// Listen for successful scans
@barcode-scanned="onBarcodeScanned"

// Listen for scanner close
@scanner-closed="onScannerClosed"

// Component props
:scan-type="'Both'" // 'QR Code', 'Barcode', 'Both'
```

### Event Handlers
```javascript
methods: {
  onBarcodeScanned(result) {
    console.log('Scanned:', result);
    // Handle scanned barcode
  },

  onScannerClosed() {
    console.log('Scanner closed');
    // Handle scanner close
  }
}
```

## Technical Implementation

### File Structure
- **Main Component**: `frontend/src/posapp/components/pos/CameraScanner.vue`
- **OpenCV Processor**: `frontend/src/posapp/utils/opencvProcessor.js`
- **Web Worker Manager**: `frontend/src/posapp/utils/opencvWorkerManager.js`
- **OpenCV Worker**: `frontend/src/posapp/workers/opencvWorker.js`
- **Dependencies**: `@techstark/opencv-js` (bundled locally), `vue-qrcode-reader`

### Web Worker Architecture
- **Main Thread**: Camera handling, UI updates, barcode detection
- **Worker Thread**: Heavy OpenCV image processing operations
- **Communication**: Message passing with promise-based API
- **Error Handling**: Graceful fallback to main thread processing

### Memory Management
- Automatic cleanup of OpenCV matrices in Worker thread
- Proper disposal of camera streams in main thread
- Worker cleanup on component unmount
- Error recovery and fallback handling

### Optimized Processing Pipeline Steps (in Web Worker)
1. **Frame Capture**: Get video frame from camera (every 3rd frame)
2. **Worker Transfer**: Send ImageData to Web Worker via message passing
3. **Noise Reduction**: Light Gaussian blur (3x3 kernel for speed)
4. **Edge Enhancement**: Unsharp masking for better definition
5. **Thresholding**: Adaptive binary conversion (optimized parameters)
6. **Cleanup**: Light morphological operations (3x3 kernel)
7. **Result Transfer**: Send processed ImageData back to main thread
8. **Detection**: Barcode/QR code recognition on main thread

## Performance Considerations

### Device Requirements
- **Minimum**: 720p camera resolution
- **Recommended**: 1080p camera with autofocus
- **Optimal**: Rear camera with macro focus capability

### Network Impact
- OpenCV.js library: ~11MB (bundled locally, no network dependency)
- Real-time processing: Complete offline capability
- No external dependencies: Works without internet connection
- Web Worker: Separate thread prevents POS UI blocking

### Battery Usage
- Enhanced mode increases power consumption
- OpenCV processing uses more CPU
- Flash usage significantly drains battery

## Troubleshooting

### Debug Information
Check browser console for:
- OpenCV initialization status
- Camera configuration details
- Processing pipeline errors

### Performance Issues
1. Disable OpenCV processing temporarily
2. Switch to Standard mode
3. Close other camera-using applications
4. Try different browser

### Scanning Issues
1. Ensure good lighting conditions
2. Hold steady at appropriate distance
3. Clean camera lens
4. Try Enhanced mode for difficult barcodes

## Security Notes

- Camera access requires user permission
- No image data is transmitted or stored
- Processing happens entirely client-side
- Scanned results are handled by parent component

## Support

For technical issues:
1. Check browser console for error messages
2. Verify HTTPS is enabled
3. Test camera with other applications
4. Try different browsers for compatibility