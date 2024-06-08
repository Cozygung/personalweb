import logo from './logo.svg';
import { RouterProvider } from 'react-router-dom';
import './App.css';
import {useEffect, useState} from "react";

// TODO: Switch from fetch requests to axios.
// TODO: Add response interceptor using axios to refresh token if a request returns a TokenExpiredError
function App() {
  const [accessToken, setAccessToken] = useState(null);

  async function login() {
    const payload = {
      username: 'alex6608',
      password: "Alex6608"
    };

    const res = await fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include',
      mode: 'cors'
    }).then(async (response) => {
      const res = await response.json();
      console.log(res)
      if (!response.ok) {
        throw new Error("Something went wrong!");
      }
      return res
    });

    localStorage.setItem("authToken", res.accessToken);
    setAccessToken(res.accessToken);
  }

  async function logout() {
    const res = await fetch('http://localhost:3000/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      mode: 'cors'
    }).then(async (response) => {
      const res = await response.json();
      console.log(res)
      if (!response.ok) {
        throw new Error("Something went wrong!");
      }
      return res
    });
    
    localStorage.removeItem("authToken");
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

    const res = await fetch('http://localhost:3000/user', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('authToken'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      mode: 'cors'
    }).then(async (response) => {
      const res = await response.json();
      console.log(res)
      if (!response.ok) {
        throw new Error("Something went wrong!");
      }
      return res
    });
  }

  useEffect(() => {
    // Check if access token exists in localStorage
    console.log(accessToken);
    if (accessToken) {
      console.log("test")
      setAccessToken(accessToken);

      // Start timer to refresh token before expiration
      const expirationTime = 29 * 60 * 1000; // 29 minutes (access token expires in 30 minutes)
      const refreshTokenTimer = setTimeout(refreshAccessToken, expirationTime);

      return () => clearTimeout(refreshTokenTimer);
    }
  }, [accessToken]);

  const refreshAccessToken = async () => {
    try {
      const csrf = await fetch('http://localhost:3000/form', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('authToken'),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        mode: 'cors'
      }).then(async (response) => {
        const res = await response.json();
        console.log(res)
        if (!response.ok) {
          throw new Error("Something went wrong!");
        }
        return res
      });

      const res = await fetch('http://localhost:3000/token', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('authToken'),
          'Content-Type': 'application/json',
          'xsrf-token': csrf.csrfToken
        },
        credentials: 'include',
        mode: 'cors'
      }).then(async (response) => {
        const res = await response.json();
        console.log(res)
        if (!response.ok) {
          throw new Error("Something went wrong!");
        }
        return res
      });

      // Update access token in state and localStorage
      const newAccessToken = res.accessToken;
      setAccessToken(newAccessToken);
      localStorage.setItem('authToken', newAccessToken);
      
    } catch (error) {
      console.error('Token refresh failed:', error.message);
      // Handle token refresh failure (e.g., redirect to login page)
    }
  };


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
        <a className="Test" href="" target="_blank">Access Token: {accessToken}</a>
      </header>
    </div>
  );
}

export default App;
