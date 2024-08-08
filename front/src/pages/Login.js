import React, {useEffect, useState} from 'react';
import {useNavigate} from "react-router-dom";
import {useAuth} from "../store/AuthContext";

import axiosInstance from '../modules/AxiosModule';

import Layout from "./Layout";

import styles from '../styles/LoginPage.module.css';
import {getUserDeviceInfo} from "../modules/UserDeviceModule";

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const navigate = useNavigate();
    const { isAuthenticated, login } = useAuth();
    
    useEffect(() => {
        if (isAuthenticated) {
            navigate("/dashboard")
        }
    }, [isAuthenticated])

    async function handleLogin() {
        const payload = {
            username: username,
            password: password,
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

    return (
        <Layout>
            <div className={styles.loginPage}>
                <main className={styles.mainContent}>
                    {isAuthenticated ? (
                        <div className={styles.card}>
                            <div>
                                <label>
                                    Username:
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                    />
                                </label>
                            </div>
                            <div>
                                <label>
                                    Password:
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </label>
                            </div>
                            <button onClick={handleLogin}>Login</button>
                        </div>
                    ) : (
                        <div className={styles.card}>
                            <p>User is authenticated</p>
                        </div>
                    )}
                </main>
            </div>
        </Layout>
    );
};

export default Login;