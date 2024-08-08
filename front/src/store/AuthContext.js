import React, {createContext, useContext, useEffect, useState} from 'react';
import axiosInstance from '../modules/AxiosModule';

const AuthContext = createContext();

// TODO: Consider using a state management library (like Redux, MobX, or Context API) for global state.
export const AuthProvider = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        const reauthenticateUser = async () => {
            try {
                const csrf = await axiosInstance.get('http://localhost:3000/form');
                axiosInstance.setCSRFToken(csrf.data.csrfToken);
                
                const accessToken = await axiosInstance.refreshToken();
                login(accessToken);
            } catch (error) {
                console.error('Error authenticating:', error);
            }
        };
        
        if (!isAuthenticated) {
            reauthenticateUser();
        }
    }, [isAuthenticated]);
    
    const login = (token) => {
        axiosInstance.setToken(token);
        setIsAuthenticated(true);
        console.log(isAuthenticated)
    };

    const logout = () => {
        axiosInstance.setToken(null); // Clear the access token
        setIsAuthenticated(false); // Update authentication state
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