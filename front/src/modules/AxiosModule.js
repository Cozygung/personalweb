import axios, {AxiosRequestConfig, HttpStatusCode} from 'axios';
import {getUserDeviceInfo} from "./UserDeviceModule";

let token = '';
let csrf = '';

const setToken = (newToken) => {
    token = newToken;
    console.log(token)
};

const setCSRFToken = (newToken) => {
    csrf = newToken;
    instance.defaults.headers.common['xsrf-token'] = newToken;
}

// TODO: Test timeout
// Double Quotation marks 
const instance = axios.create({
    baseURL: 'http://localhost:3000',
    timeout: 10000, // Timeout in milliseconds
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true,
    validateStatus: (status) => {
        // Accept all 2xx and 3xx status codes (when redirecting)
        return status >= 200 && status < 400;
    }
});

// Request interceptor
instance.interceptors.request.use(
    config => {
        // Modify request headers or do something before request is sent
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
            console.log(token)
        }
        if (csrf) {
            config.headers['xsrf-token'] = csrf;
            console.log(csrf)
        }
        
        // We only need to send in deviceId on every request (In the header)
        config.headers['deviceId'] = JSON.stringify(getUserDeviceInfo()._id);
        
        return config;
    },
    error => {
        return Promise.reject(error);
    }
);

// Response interceptor
instance.interceptors.response.use(
    response => {
        // Handle successful responses
        return response;
    },
    async error => {
        const errorName = error.response.data.error?.name ?? undefined;
        const errorType = error.response.data.error?.type ?? undefined;
        // Handle error responses
        if (axios.isAxiosError(error) && error.response) {
            // Check if the error is due to Access Token Expiring
            if (errorName === 'TokenExpiredError' && errorType === 1 
                || errorName === 'AuthenticationError' && errorType === 1) {
                try {
                    // Attempt to refresh token
                    const refreshedAccessToken = await refreshToken();
                    setToken(refreshedAccessToken);
                    // Retry the original request with the new token
                    error.config.headers.Authorization = `Bearer ${refreshedAccessToken}`;
                    
                    return instance.request(error.config);
                } catch (refreshError) {
                    // Handle refresh token failure
                    console.error('Failed to refresh token:', refreshError.response.data)
                    // Redirect to login page or handle unauthorized error
                    // Example: window.location.href = '/login';
                    return Promise.reject(refreshError);
                }
            } else {
                // Handle other unauthorized errors (e.g., logout user, redirect to login)
                // Example: window.location.href = '/login';
                return Promise.reject(error);
            }
        }
        // For other errors, pass through
        return Promise.reject(error);
    }
);

async function refreshToken() {
    console.log('Refreshing Token')
    const payload = {
        device: getUserDeviceInfo()
    };
    
    const res = await instance.post('/token', JSON.stringify(payload), {
        withCredentials: true
    }).catch(error => {
        console.log(error)
        
        const { code, message, name } = error.response.data.error;
        const type = error.response.data.error.type ?? undefined;
        
        if (name === 'AuthenticationError' && type === 2 || name === 'TokenExpiredError' && type === 2) {
            setToken('');
        }
    });
    if (res.data.deviceId) {
        localStorage.setItem('deviceId', res.data.deviceId);
    }
    
    return res.data.accessToken;
}

instance.setToken = setToken;
instance.setCSRFToken = setCSRFToken;
instance.refreshToken = refreshToken;

export default instance;