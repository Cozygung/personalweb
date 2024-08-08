import React, { useContext } from 'react';
import {LayoutContext} from "../../store/LayoutContext";

import styles from '../../styles/Sidebar.module.css';

const Sidebar = () => {
    const [state, setState] = useContext(LayoutContext);
    // const styles = state.theme === 'light' ? lightStyles : darkStyles;
    
    return (
        <aside className={styles.sidebar}>
            <h2>Sidebar</h2>
            <ul className={styles.navList}>
                <li><a href="/">Home</a></li>
                <li><a href="/profile">Profile</a></li>
                <li><a href="/settings">Settings</a></li>
            </ul>
        </aside>
    );
};

export default Sidebar;