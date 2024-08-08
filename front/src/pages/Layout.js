import React from 'react';
import styles from '../styles/Layout.module.css'; // Import layout styles
import Sidebar from './components/Sidebar'; // Sidebar component
import Header from './components/Header';
import Footer from "./components/Footer";
import {LayoutProvider} from "../store/LayoutContext"; // Header component

const Layout = ({ children }) => {
    return (
        <LayoutProvider>
            <div className={styles.layout}>
                <Header />
                <div className={styles.content}>
                    <Sidebar />
                    <main className={styles.main}>{children}</main>
                </div>
                <Footer />
            </div>
        </LayoutProvider>
    );
};

export default Layout;