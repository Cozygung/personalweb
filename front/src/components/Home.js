import React, {useEffect, useState} from 'react';
import axiosInstance from '../modules/AxiosModule';
import '../styles/App.css';
import logo from '../logo.svg';
import axios from "axios";

function Home() {
    async function login() {
        const payload = {
            username: 'alex6608',
            password: 'Alex6608'
        };

        // TODO: Login + CSRF needs to be atomic
        const res = await axiosInstance.post('/login', JSON.stringify(payload),  {
            withCredentials: true
        }).catch(error => {
            console.log(error)
            if (error.response) {
                console.error(error.response.data.error);
            }
        });
        // Not using localstorage for accessToken. Security is more important & we don't need it to persist across tabs
        axiosInstance.setToken(res.data.accessToken);
        if (res.data.deviceId) {
            localStorage.setItem('deviceId', res.data.deviceId)
        }
        console.log(localStorage.getItem('deviceId'))
        
        const csrf = await axiosInstance.get('http://localhost:3000/form');
        axiosInstance.setCSRFToken(csrf.data.csrfToken);
    }
    
    async function logout() {
        const res = await axiosInstance.post('/logout', {},  {
            withCredentials: true
        }).catch(error => {
            console.log(error)
        });
        
        localStorage.clear();
        console.log(res);
        
        // TODO: Redirect the user to home page
    }

    async function test() {
        const res = await axiosInstance.get('/test', {
            withCredentials: true
        }).catch(error => {
            console.log(error)
        });

        localStorage.clear();
        console.log(res);

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

        const res = await axiosInstance.post('/v1/users', JSON.stringify(payload), {
            withCredentials: true
        }).catch(error => {
            console.log(error)
            if (error.response) {
                console.error(error.response.data.error);
            }
        });
        
        console.log(res);
    }
    
    // TODO: Make a query to /form when a user opens a session while logged in

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
        <div className='App'>
            <header className='App-header'>
                <img src={logo} className='App-logo' alt='logo' />
                <p>
                    Edit <code>src/App.js</code> and save to reload.
                </p>
                <a
                    className='App-link'
                    href='https://reactjs.org'
                    target='_blank'
                    rel='noopener noreferrer'
                >
                    Learn React
                </a>
                <button onClick={createUser}>create user</button>
                <button onClick={login}>login</button>
                <button onClick={logout}>logout</button>
                <button onClick={test}>test</button>
            </header>
        </div>
    );
}

export default Home;