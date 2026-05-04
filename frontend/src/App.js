import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Modal, Button, message, Spin, Badge, Tooltip } from 'antd';
import {
    DashboardOutlined,
    GlobalOutlined,
    UserOutlined,
    MailOutlined,
    LogoutOutlined,
    BarChartOutlined,
    SettingOutlined,
    BellOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    ClockCircleOutlined,
    StopOutlined,
    ApiOutlined,
    SafetyOutlined
} from '@ant-design/icons';
import axios from 'axios';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DomainsPage from './pages/DomainsPage';
import UsersPage from './pages/UsersPage';
import QueuesPage from './pages/QueuesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import SuppressionsPage from './pages/SuppressionsPage';
import ReputationPage from './pages/ReputationPage';

import './App.css';

const { Header, Sider, Content } = Layout;

const API_BASE_URL = process.env.REACT_APP_API_URL || '';
axios.defaults.baseURL = API_BASE_URL;

// Session auto-logout config (in milliseconds)
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;       // 3 minutes
const WARN_BEFORE_MS = 30 * 1000;            // warn 30 seconds before
const IDLE_WARN_MS = IDLE_TIMEOUT_MS - WARN_BEFORE_MS;

const ProtectedRoute = ({ children, isAuthenticated }) =>
    isAuthenticated ? children : <Navigate to="/login" replace />;

// Main authenticated layout with idle timer
function AuthenticatedApp({ user, onLogout, collapsed, setCollapsed }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [idleWarning, setIdleWarning] = useState(false);
    const [countdown, setCountdown] = useState(30);
    const idleTimerRef = useRef(null);
    const warnTimerRef = useRef(null);
    const countdownRef = useRef(null);

    const doLogout = useCallback(() => {
        setIdleWarning(false);
        onLogout();
        navigate('/login', { replace: true });
    }, [onLogout, navigate]);

    const resetIdleTimer = useCallback(() => {
        if (idleWarning) return; // don't reset during warning
        clearTimeout(idleTimerRef.current);
        clearTimeout(warnTimerRef.current);

        warnTimerRef.current = setTimeout(() => {
            setIdleWarning(true);
            setCountdown(30);
        }, IDLE_WARN_MS);

        idleTimerRef.current = setTimeout(() => {
            doLogout();
            message.warning('You were logged out due to inactivity.');
        }, IDLE_TIMEOUT_MS);
    }, [idleWarning, doLogout]);

    // Start/reset idle timer on user activity
    useEffect(() => {
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        events.forEach(e => window.addEventListener(e, resetIdleTimer));
        resetIdleTimer();
        return () => {
            events.forEach(e => window.removeEventListener(e, resetIdleTimer));
            clearTimeout(idleTimerRef.current);
            clearTimeout(warnTimerRef.current);
        };
    }, [resetIdleTimer]);

    // Countdown tick when warning is shown
    useEffect(() => {
        if (idleWarning) {
            countdownRef.current = setInterval(() => {
                setCountdown(c => {
                    if (c <= 1) {
                        clearInterval(countdownRef.current);
                        return 0;
                    }
                    return c - 1;
                });
            }, 1000);
        } else {
            clearInterval(countdownRef.current);
        }
        return () => clearInterval(countdownRef.current);
    }, [idleWarning]);

    const handleStayLoggedIn = () => {
        setIdleWarning(false);
        clearTimeout(idleTimerRef.current);
        clearTimeout(warnTimerRef.current);
        resetIdleTimer();
    };

    // Derive selected menu key from path
    const pathToKey = {
        '/': 'dashboard',
        '/domains': 'domains',
        '/users': 'users',
        '/queues': 'queues',
        '/analytics': 'analytics',
        '/suppressions': 'suppressions',
        '/reputation': 'reputation',
        '/settings': 'settings',
        '/profile': 'profile'
    };
    const selectedKey = pathToKey[location.pathname] || 'dashboard';

    const initials = user?.username
        ? user.username.slice(0, 2).toUpperCase()
        : user?.email?.slice(0, 2).toUpperCase() || 'AD';

    const userMenuItems = [
        {
            key: 'user-info',
            label: (
                <div style={{ padding: '6px 4px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.username || user?.email}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{user?.email}</div>
                    <span className="profile-role-badge" style={{ marginTop: 6, display: 'inline-block' }}>{user?.role}</span>
                </div>
            ),
            disabled: true
        },
        { type: 'divider' },
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: 'My Profile',
            onClick: () => navigate('/profile')
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: 'Settings',
            onClick: () => navigate('/settings')
        },
        { type: 'divider' },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: <span style={{ color: '#ef4444' }}>Sign Out</span>,
            onClick: doLogout,
            danger: true
        }
    ];

    return (
        <Layout style={{ minHeight: '100vh' }}>
            {/* Idle warning modal */}
            <Modal
                open={idleWarning}
                closable={false}
                maskClosable={false}
                footer={null}
                centered
                width={380}
            >
                <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
                    <ClockCircleOutlined style={{ fontSize: 44, color: '#ef4444', marginBottom: 14 }} />
                    <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Session Expiring Soon</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                        You will be automatically logged out in
                    </div>
                    <div className="idle-countdown">{countdown}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>seconds</div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                        <Button type="primary" size="large" onClick={handleStayLoggedIn} style={{ minWidth: 140 }}>
                            Stay Logged In
                        </Button>
                        <Button size="large" onClick={doLogout} danger style={{ minWidth: 100 }}>
                            Logout
                        </Button>
                    </div>
                </div>
            </Modal>

            <Sider
                className="mta-sider"
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                trigger={null}
                width={240}
                collapsedWidth={64}
                style={{
                    background: '#0f172a',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 200,
                    overflow: 'hidden'
                }}
            >
                {/* Logo */}
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">✉</div>
                    {!collapsed && (
                        <div className="sidebar-logo-text">
                            <span className="sidebar-logo-name">CloudMTA</span>
                            <span className="sidebar-logo-sub">Admin Portal</span>
                        </div>
                    )}
                </div>

                {/* Nav Menu */}
                <Menu
                    className="mta-menu"
                    theme="dark"
                    mode="inline"
                    selectedKeys={[selectedKey]}
                    items={[
                        {
                            key: 'dashboard',
                            icon: <DashboardOutlined />,
                            label: 'Dashboard',
                            onClick: () => navigate('/')
                        },
                        {
                            key: 'domains',
                            icon: <GlobalOutlined />,
                            label: 'Domains',
                            onClick: () => navigate('/domains')
                        },
                        {
                            key: 'users',
                            icon: <UserOutlined />,
                            label: 'Users',
                            onClick: () => navigate('/users')
                        },
                        {
                            key: 'queues',
                            icon: <MailOutlined />,
                            label: 'Message Queue',
                            onClick: () => navigate('/queues')
                        },
                        {
                            key: 'analytics',
                            icon: <BarChartOutlined />,
                            label: 'Analytics',
                            onClick: () => navigate('/analytics')
                        },
                        {
                            key: 'suppressions',
                            icon: <StopOutlined />,
                            label: 'Suppression List',
                            onClick: () => navigate('/suppressions')
                        },
                        {
                            key: 'reputation',
                            icon: <SafetyOutlined />,
                            label: 'Reputation',
                            onClick: () => navigate('/reputation')
                        },
                        {
                            key: 'settings',
                            icon: <SettingOutlined />,
                            label: 'Settings',
                            onClick: () => navigate('/settings')
                        }
                    ]}
                />

                {/* Bottom user section */}
                {!collapsed && (
                    <div className="sidebar-bottom-section">
                        <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="topLeft">
                            <div className="sidebar-user-card">
                                <div className="sidebar-avatar">{initials}</div>
                                <div className="sidebar-user-info">
                                    <div className="sidebar-user-name">{user?.username || 'Admin'}</div>
                                    <div className="sidebar-user-role">{user?.role}</div>
                                </div>
                            </div>
                        </Dropdown>
                    </div>
                )}
            </Sider>

            <Layout style={{ marginLeft: collapsed ? 64 : 240, transition: 'margin-left 0.2s' }}>
                {/* Header */}
                <Header className="mta-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <Button
                            type="text"
                            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            onClick={() => setCollapsed(!collapsed)}
                            style={{ fontSize: 16, width: 36, height: 36 }}
                        />
                        <span className="header-title">CloudMTA Admin Portal</span>
                    </div>
                    <div className="header-right">
                        <Tooltip title="Notifications">
                            <Button type="text" style={{ display: 'flex', alignItems: 'center' }}>
                                <Badge count={0} size="small">
                                    <BellOutlined style={{ fontSize: 17 }} />
                                </Badge>
                            </Button>
                        </Tooltip>
                        <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
                            <div className="header-user-btn">
                                <div className="header-avatar">{initials}</div>
                                <span className="header-user-name">{user?.username || user?.email}</span>
                            </div>
                        </Dropdown>
                    </div>
                </Header>

                {/* Content */}
                <Content className="mta-content">
                    <Routes>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/domains" element={<DomainsPage />} />
                        <Route path="/users" element={<UsersPage />} />
                        <Route path="/queues" element={<QueuesPage />} />
                        <Route path="/analytics" element={<AnalyticsPage />} />
                        <Route path="/suppressions" element={<SuppressionsPage />} />
                        <Route path="/reputation" element={<ReputationPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/profile" element={<ProfilePage user={user} />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Content>
            </Layout>
        </Layout>
    );
}

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            axios.get('/api/v1/auth/me')
                .then(res => {
                    setUser(res.data);
                    setIsAuthenticated(true);
                })
                .catch(() => {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    delete axios.defaults.headers.common['Authorization'];
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    // Axios 401 interceptor
    useEffect(() => {
        const interceptor = axios.interceptors.response.use(
            res => res,
            err => {
                if (err.response?.status === 401) {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    delete axios.defaults.headers.common['Authorization'];
                    setIsAuthenticated(false);
                    setUser(null);
                }
                return Promise.reject(err);
            }
        );
        return () => axios.interceptors.response.eject(interceptor);
    }, []);

    const handleLogout = useCallback(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        delete axios.defaults.headers.common['Authorization'];
        setIsAuthenticated(false);
        setUser(null);
        message.success('Logged out successfully');
    }, []);

    if (loading) {
        return (
            <div className="loading-screen">
                <Spin size="large" />
                <span style={{ color: '#64748b', fontSize: 14 }}>Loading CloudMTA...</span>
            </div>
        );
    }

    return (
        <Router>
            {isAuthenticated ? (
                <AuthenticatedApp
                    user={user}
                    onLogout={handleLogout}
                    collapsed={collapsed}
                    setCollapsed={setCollapsed}
                />
            ) : (
                <Routes>
                    <Route
                        path="/login"
                        element={
                            <LoginPage
                                setIsAuthenticated={setIsAuthenticated}
                                setUser={setUser}
                            />
                        }
                    />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            )}
        </Router>
    );
}

export default App;

