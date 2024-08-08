import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "../store/AuthContext";
import {getUserDeviceInfo} from "../modules/UserDeviceModule";

import axiosInstance from '../modules/AxiosModule';

// TODO: Use flexible grid layouts and CSS media queries to adapt to various screen sizes and orientations.
// TODO: Use appropriate image formats and compress images to reduce loading times.

import styles from '../styles/HomePage.module.css';
import logo from '../logo.svg';

// TODO: Use local state for component-specific data
// TODO: Avoid Inline Functions: Avoid creating inline functions in render methods as they create new instances on every render, leading to performance issues.
// TODO: Lazy Loading Routes: Implement code-splitting with React.lazy and Suspense to load components only when needed, improving performance.
// TODO: Memoization: Use React.memo and useMemo to prevent unnecessary re-renders of components.
// TODO: Static Site Generation: Consider using tools like Next.js for static site generation (SSG) if SEO and performance are priorities.
// TODO: CI/CD Pipelines: Set up Continuous Integration and Continuous Deployment (CI/CD) pipelines for automated testing and deployment.
// TODO: Analytics: Implement analytics tools (like Google Analytics) to track user interactions and optimize the user experience.
const Home = () => {
    const navigate = useNavigate();
    const { login, logout } = useAuth();
    
    async function handleLogin() {
        const payload = {
            username: 'alex6608',
            password: 'Alex6608',
            device: getUserDeviceInfo()
        };
        
        const res = await axiosInstance.post('/login', JSON.stringify(payload),  {})
            .catch(error => {
                console.log(error)
                if (error.response) {
                    console.error(error.response.data.error);
                }
            });
        // Not using localstorage for accessToken. Security is more important & we don't need it to persist across tabs
        login(res.data.accessToken);
        if (res.data.deviceId) {
            localStorage.setItem('deviceId', res.data.deviceId)
        }
        console.log(localStorage.getItem('deviceId'))
    }
    
    async function handleLogout() {
        const payload = {
            device: getUserDeviceInfo()
        }
        const res = await axiosInstance.post('/logout', JSON.stringify(payload))
            .catch(error => {
                console.log(error)
            });
        
        localStorage.clear();
        logout();
        console.log(res);
        
        // TODO: Redirect the user to home page
    }

    async function test() {
        const res = await axiosInstance.get('/test')
            .catch(error => {
                console.log(error)
            });

        if (res.data.redirect) {
            // Redirect to the dashboard
            navigate(res.data.redirect);
        }

        // TODO: Redirect the user to home page
    }

    async function createUser() {
        const payload = {
            username: 'alex66081',
            firstName: 'Alex',
            lastName: 'Kim',
            password: 'Abcdefghijklmnopqrstuvwxyz123456',
            userType: 'Admin',
        };

        const res = await axiosInstance.post('/v1/users', JSON.stringify(payload)).catch(error => {
            console.log(error)
            if (error.response) {
                console.error(error.response.data.error);
            }
        });
        
        console.log(res);
    }

    useEffect(() => {
        // Function to handle the beforeunload event
        const handleBeforeUnload = (event) => {
            // Prevent default browser behavior (Showing confirmation dialog).
            event.preventDefault();

            // Set the return message here (Older Browsers)
            event.returnValue = '';

            // Set the return message (Modern Browsers)
            return ''
        };

        // Add event listener when component mounts
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Cleanup: Remove event listener when component unmounts
        return () => {
            // Remove the event listener (clean up)
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []); // Empty dependency array ensures this effect runs only once, on mount

    return (
        <div className={styles.app}>
            <header className={styles.appHeader}>
                <img src={logo} className={styles.appLogo} alt='logo' />
                <p>
                    Edit <code>src/App.js</code> and save to reload.
                </p>
                <a
                    className={styles.appLink}
                    href='https://reactjs.org'
                    target='_blank'
                    rel='noopener noreferrer'
                >
                    Learn React
                </a>
                <button onClick={createUser}>create user</button>
                <button onClick={handleLogin}>login</button>
                <button onClick={handleLogout}>logout</button>
                <button onClick={test}>test</button>
            </header>
        </div>
    );
}

export default Home;