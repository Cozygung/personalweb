import axios, {AxiosRequestConfig, HttpStatusCode} from 'axios';

let token = '';
let csrf = '';

const setToken = (newToken) => {
    token = newToken;
};

const setCSRFToken = (newToken) => {
    csrf = newToken;
    instance.defaults.headers.common['xsrf-token'] = newToken;
}

// TODO: Test timeout
const instance = axios.create({
    baseURL: 'http://localhost:3000',
    timeout: 10000, // Timeout in milliseconds
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true
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
        // Handle error responses
        if (axios.isAxiosError(error) && error.response) {
            // Check if the error is due to Access Token Expiring
            if (error.response.data.error.name === 'TokenExpiredError' && error.response.data.error.type === 1 
                || error.response.data.error.name === 'AuthenticationError' && error.response.data.error.type === 1) {
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
    const tokenConfig = {
        baseURL: 'http://localhost:3000',
        timeout: 10000, // Timeout in milliseconds
        headers: {
            'Authorization': 'Bearer ' + token,
            'xsrf-token': csrf,
            'Content-Type': 'application/json'
        },
        withCredentials: true
    };
    const res = await axios.post('http://localhost:3000/token', {}, tokenConfig).catch(error => {
        console.log(error)
        if (error.response) {
            console.error(error.response.data.error);
        }
    });
    console.log(res);
    
    return res.data.accessToken;
}

instance.setToken = setToken;
instance.setCSRFToken = setCSRFToken;

export default instance;