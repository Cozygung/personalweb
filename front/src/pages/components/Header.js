import React, { useContext } from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../../store/AuthContext';
import {getUserDeviceInfo} from '../../modules/UserDeviceModule';

import {LayoutContext} from '../../store/LayoutContext';

import styles from '../../styles/Header.module.css';
import profileIcon from '../../assets/profile-icon.png';

import axiosInstance from '../../modules/AxiosModule';

const Header = () => {
    const [state, setState] = useContext(LayoutContext);

    const { logout } = useAuth();
    const navigate = useNavigate();
    // const styles = state.theme === 'light' ? lightStyles : darkStyles;

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

        navigate("/");
    }
    
    return (
        <header className={styles.header}>
            <h1>My Website</h1>
            <nav className={styles.nav}>
                <ul className={styles.navList}>
                    <li><a href="/">Home</a></li>
                    <li><a href="/about">About</a></li>
                    <li><a href="#">Services</a></li>
                    <li><a href="#">Contact</a></li>
                </ul>
                <div className={styles.profileIcon}>
                    <img src={profileIcon} alt="User Profile" />
                </div>
            </nav>
        </header>
    );
};

export default Header;