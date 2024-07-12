import React, {useEffect, useState} from 'react';
import axiosInstance from '../AxiosModule';
import '../styles/App.css';
import logo from "../logo.svg";

// TODO: Implement error catching with requests
function Home() {
    async function login() {
        const payload = {
            username: 'alex6608',
            password: 'Alex6608'
        };

        const res = await axiosInstance.post('/login', JSON.stringify(payload),  {
            withCredentials: true
        })
        axiosInstance.setToken(res.data.accessToken);
        
        const csrf = await axiosInstance.get('http://localhost:3000/form');
        axiosInstance.setCSRFToken(csrf.data.csrfToken);
    }
    
    async function logout() {
        const res = await axiosInstance.post('/logout', {},  {
            withCredentials: true
        });
        
        console.log(res);
        
        // TODO: Redirect the user to home page
    }

    async function createUser() {
        const payload = {
            username: "alex66081",
            firstName: "Alex",
            lastName: "Kim",
            password: "Alex6608",
            userType: "Admin",
        };

        const res = await axiosInstance.post('/user', JSON.stringify(payload), {
            withCredentials: true
        });
        
        console.log(res);
    }

    // TODO: Maybe we don't need to Delete JWT tokens stored in Cookie and DB once user closes tab
    useEffect(() => {
        // Function to handle the beforeunload event
        const handleBeforeUnload = (event) => {
            // Prevent default browser behavior (Showing confirmation dialog).
            event.preventDefault();

            // Set the return message here (Older Browsers)
            event.returnValue = '';

            // Logout user 
            logout();

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
        <div className="App">
            <header className="App-header">
                <img src={logo} className="App-logo" alt="logo" />
                <p>
                    Edit <code>src/App.js</code> and save to reload.
                </p>
                <a
                    className="App-link"
                    href="https://reactjs.org"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Learn React
                </a>
                <button onClick={createUser}>create user</button>
                <button onClick={login}>login</button>
                <button onClick={logout}>logout</button>
            </header>
        </div>
    );
}

export default Home;