import React from 'react';
import axiosInstance from '../modules/AxiosModule';

function Dashboard() {
    const handleLogout = async () => {
        const res = await axiosInstance.post('/logout', {},  {
            withCredentials: true,
            mode: 'cors'
        });

        console.log(res);

        // TODO: Redirect the user to home page
        // Optionally: Redirect user to login page or perform other actions
    };

    return (
        <div>
            <h2>Dashboard</h2>
            <button onClick={handleLogout}>Logout</button>
        </div>
    );
}

export default Dashboard;