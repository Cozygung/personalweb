import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Dashboard from './components/Dashboard';
import Home from './components/Home'


// TODO: Switch from fetch requests to axios.
// TODO: Add response interceptor using axios to refresh token if a request returns a TokenExpiredError
function App() {


  return (
      <Router>
        <Routes>
          <Route exact path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Router>
  );
}

export default App;
