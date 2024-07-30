import UAParser from 'ua-parser-js';

const parser = new UAParser();
parser.setUA(navigator.userAgent);

export const getUserDeviceInfo = () => {
    return {
        _id: localStorage.getItem('deviceId') || generateDeviceId(),
        userAgent: parser.getResult(),
        windowScreen: {
            width: window.screen.width,
            height: window.screen.height,
            colorDepth: window.screen.colorDepth
        },
        webGLInfo: getWebGLInfo(),
        heapSizeLimit: getHeapSizeLimit()
    }
}

function generateDeviceId() {
    const array = new Uint8Array(12);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function getWebGLInfo() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
        return {
            vendor: undefined,
            renderer: undefined,
            version: undefined,
        };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

    return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
        version: gl.getParameter(gl.VERSION),
    };
}

function getHeapSizeLimit() {
    if (window.performance.memory) {
        const limit = window.performance.memory.jsHeapSizeLimit;
        const limitMB = limit / (1024 * 1024);
        return limitMB
    }
    return undefined
}

function getGeoLocation() {
    if ("geolocation" in navigator) {
        return navigator.geolocation.getCurrentPosition(
            (position) => {
                // Success callback
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                return {
                    latitude: latitude,
                    longitude: longitude
                }
            },
            (error) => {
                // Error callback
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        console.error("User denied the request for Geolocation.");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        console.error("Location information is unavailable.");
                        break;
                    case error.TIMEOUT:
                        console.error("The request to get user location timed out.");
                        break;
                    case error.UNKNOWN_ERROR:
                        console.error("An unknown error occurred.");
                        break;
                }
            }, {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        return {
            latitude: undefined,
            longitude: undefined
        }
    }
}