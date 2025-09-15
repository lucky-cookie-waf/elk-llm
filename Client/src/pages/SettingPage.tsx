import React, { useRef, useState } from "react";

const SettingsPage: React.FC = () => {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [username, setUsername] = useState("Lucky cookie");
  const [email, setEmail] = useState("luckycookie@ewha.ac.kr");
  const [sessionTimeout, setSessionTimeout] = useState("30m");
  const [timezone, setTimezone] = useState("KST");

  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = () => inputRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      alert("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(f);
  };

  const onSave = () => {
    // API 호출 부분
    const payload = {
      username,
      email,
      info: { sessionTimeout, timezone },
      hasAvatar: !!avatar,
    };
    console.log("save settings:", payload);
    alert("Settings saved (mock). 콘솔을 확인하세요.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 상단 타이틀 */}
      <h1 style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>Settings</h1>

      {/* 메인 카드 */}
      <div
        style={{
          background: "#0b1220",
          border: "1px solid #1f2937",
          borderRadius: 12,
          padding: 24,
        }}
      >
        {/* 박스 */}
        <div
          style={{
            border: "2px solid #323232ff",
            borderRadius: 12,
            padding: 24,
            background: "#0b1220",
          }}
        >
          {/* 아바타 업로드 섹션 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              marginBottom: 26,
            }}
          >
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                background: "#0f172a",
                border: "1px solid #1f2937",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt="avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 26, opacity: 0.7 }}>📷</span>
              )}
            </div>
            <button
              onClick={onPickFile}
              style={{
                background: "transparent",
                color: "#60a5fa",
                border: "none",
                textDecoration: "underline",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Upload Image
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              style={{ display: "none" }}
            />
          </div>

          {/* 폼 영역 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
            }}
          >
            {/* 프로필 입력 */}
            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                  User name
                </div>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your name"
                  style={{
                    width: "100%",
                    background: "#0b1220",
                    border: "1px solid #1f2937",
                    borderRadius: 10,
                    padding: "12px 14px",
                    color: "#e5e7eb",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                  Email
                </div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email"
                  style={{
                    width: "100%",
                    background: "#0b1220",
                    border: "1px solid #1f2937",
                    borderRadius: 10,
                    padding: "12px 14px",
                    color: "#e5e7eb",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* 정보 박스 */}
            <div>
              <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
                Information
              </div>
              <div
                style={{
                  background: "#0b1220",
                  border: "1px solid #1f2937",
                  borderRadius: 10,
                  padding: 14,
                  minHeight: 120,
                }}
              >
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                  <li style={{ marginBottom: 8 }}>
                    <span style={{ opacity: 0.9 }}>Session Timeout:&nbsp;</span>
                    <input
                      value={sessionTimeout}
                      onChange={(e) => setSessionTimeout(e.target.value)}
                      style={{
                        background: "#111827",
                        border: "1px solid #1f2937",
                        borderRadius: 8,
                        padding: "6px 10px",
                        color: "#e5e7eb",
                        outline: "none",
                        width: 80,
                      }}
                    />
                  </li>
                  <li>
                    <span style={{ opacity: 0.9 }}>Standard time:&nbsp;</span>
                    <input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      style={{
                        background: "#111827",
                        border: "1px solid #1f2937",
                        borderRadius: 8,
                        padding: "6px 10px",
                        color: "#e5e7eb",
                        outline: "none",
                        width: 100,
                      }}
                    />
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 저장 버튼 */}
          <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
            <button
              onClick={onSave}
              style={{
                padding: "12px 38px",
                borderRadius: 12,
                background: "#3b82f6",
                border: "1px solid #1d4ed8",
                color: "white",
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 6px 18px rgba(59,130,246,.25)",
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
