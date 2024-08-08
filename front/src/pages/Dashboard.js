import React from 'react';

import axiosInstance from '../modules/AxiosModule';

import Layout from "./Layout";

import styles from "../styles/DashboardPage.module.css";

const Dashboard = () => {
    

    return (
        <Layout>
            <div className={styles.dashboardPage}>
                <main className={styles.mainContent}>
                    <div className={styles.card}>
                        <h2>Card Title 1</h2>
                        <p>This is some information about card 1.</p>
                    </div>
                    <div className={styles.card}>
                        <h2>Card Title 2</h2>
                        <p>This is some information about card 2.</p>
                    </div>
                    <div className={styles.card}>
                        <h2>Card Title 3</h2>
                        <p>This is some information about card 3.</p>
                    </div>
                    <div className={styles.card}>
                        <h2>Card Title 4</h2>
                        <p>This is some information about card 4.</p>
                    </div>
                </main>
            </div>
        </Layout>
    );
}

export default Dashboard;