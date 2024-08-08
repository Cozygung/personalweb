import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Dashboard from './pages/Dashboard';
import Home from './pages/Home'
import { AuthProvider } from './store/AuthContext'
import Login from "./pages/Login";
import About from "./pages/About";

// TODO: Add LoginPage
const App = () => {

    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route exact path="/" element={ <Home/> } />
                    <Route path="/dashboard" element={ <Dashboard/> } />
                    <Route path="/login" element={ <Login/> } />
                    <Route path="/about" element={ <About/> } />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
