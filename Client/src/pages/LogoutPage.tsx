import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const LogoutPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // 필요한 키만 정리(예: 토큰). 전부 지우고 싶지 않다면 특정 키만 removeItem 하세요.
    localStorage.removeItem("authToken");
    sessionStorage.removeItem("authToken");

    //서버 로그아웃 API 호출 위치
    // await api.logout();

    // 대시보드로 이동
    navigate("/", { replace: true });
  }, [navigate]);

  return <p>Logging out…</p>;
};

export default LogoutPage;
