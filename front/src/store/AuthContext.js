import React, {createContext, useContext, useEffect, useState} from 'react';
import axiosInstance from '../modules/AxiosModule';

const AuthContext = createContext();

// TODO: Consider using a state management library (like Redux, MobX, or Context API) for global state.
export const AuthProvider = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    
    // TODO: Components should handle redirects when user is not authenticated
    useEffect(() => {
        const reauthenticateUser = async () => {
            try {
                const csrf = await axiosInstance.get('http://localhost:3000/form');
                axiosInstance.setCSRFToken(csrf.data.csrfToken);
                
                const accessToken = await axiosInstance.refreshToken();
                await login(accessToken);
            } catch (error) {
                console.error('Error authenticating:', error);
            }
        };
        
        reauthenticateUser();
        
    }, []);
    
    const login = async (token) => {
        axiosInstance.setToken(token);
        setIsAuthenticated(true);

        // Set new CSRF token when User logs into a new session
        const csrf = await axiosInstance.get('http://localhost:3000/form');
        axiosInstance.setCSRFToken(csrf.data.csrfToken);
    };

    const logout = async () => {
        axiosInstance.setToken(null); // Clear the access token
        setIsAuthenticated(false); // Update authentication state

        // Set new CSRF token when User logs out
        const csrf = await axiosInstance.get('http://localhost:3000/form');
        axiosInstance.setCSRFToken(csrf.data.csrfToken);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};