import React, { useState } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import PIBDashboard from './components/PIBDashboard';
import RadianzaVsPIBDashboard from './components/RadianzaVsPIBDashboard';
import Header from './components/Header';

function App() {
  const [currentPage, setCurrentPage] = useState('radianza');

  const renderPage = () => {
    if (currentPage === 'radianza') {
      return <Dashboard />;
    } else if (currentPage === 'pib') {
      return <PIBDashboard />;
    } else if (currentPage === 'comparison') {
      return <RadianzaVsPIBDashboard />;
    }
    return <Dashboard />;
  };

  return (
    <div className="App">
      <Header currentPage={currentPage} onPageChange={setCurrentPage} />
      {renderPage()}
    </div>
  );
}

export default App;
