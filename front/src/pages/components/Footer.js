import React, { useContext } from 'react';
import {LayoutContext} from "../../store/LayoutContext";

import styles from '../../styles/Footer.module.css';

const Sidebar = () => {
    const [state, setState] = useContext(LayoutContext);
    // const styles = state.theme === 'light' ? lightStyles : darkStyles;
    
    return (
        <footer className={styles.footer}>
            <p>&copy; 2024 My Website</p>
        </footer>
    );
};

export default Sidebar;