import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const LogoutPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.removeItem("authToken");
    sessionStorage.removeItem("authToken");
    navigate("/", { replace: true });
  }, [navigate]);

  return <p>Logging out…</p>;
};

export default LogoutPage;
