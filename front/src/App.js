import logo from './logo.svg';
import { RouterProvider } from 'react-router-dom';
import './App.css';
import {useState} from "react";

function App() {
  const [accessToken, setAccessToken] = useState("Null");

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

  async function refresh() {
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

    setAccessToken(res.accessToken);
  }
  
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
        <button onClick={refresh}>refresh</button>
        <a className="Test" href="" target="_blank">Access Token: {accessToken}</a>
      </header>
    </div>
  );
}

export default App;
