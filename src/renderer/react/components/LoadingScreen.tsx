import React from "react";

const LoadingScreen: React.FC = () => {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="spinner"></div>
        <h2>Loading AI Chatbot...</h2>
        <p>Initializing services and connecting to AI providers</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
