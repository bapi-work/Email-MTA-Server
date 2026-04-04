import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Menu, Dropdown, Button, message } from 'antd';
import {
    DashboardOutlined,
    CopyOutlined,
    UserOutlined,
    MailOutlined,
    LogoutOutlined,
    BarChartOutlined
} from '@ant-design/icons';
import axios from 'axios';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DomainsPage from './pages/DomainsPage';
import UsersPage from './pages/UsersPage';
import QueuesPage from './pages/QueuesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';

import './App.css';

const { Header, Sider, Content, Footer } = Layout;

// API Base URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
axios.defaults.baseURL = API_BASE_URL;

// Route wrapper for protected routes
const ProtectedRoute = ({ children, isAuthenticated }) => {
    return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

    // Check authentication on mount
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            // Set default authorization header
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            
            // Verify token by fetching current user
            axios.get('/api/v1/auth/me')
                .then(response => {
                    setUser(response.data);
                    setIsAuthenticated(true);
                })
                .catch(() => {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    setIsAuthenticated(false);
                })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        delete axios.defaults.headers.common['Authorization'];
        setIsAuthenticated(false);
        setUser(null);
        message.success('Logged out successfully');
    };

    const userMenu = (
        <Menu>
            <Menu.Item key="profile">User Profile: {user?.email}</Menu.Item>
            <Menu.Divider />
            <Menu.Item key="settings" icon={<UserOutlined />}>Settings</Menu.Item>
            <Menu.Item key="logout" icon={<LogoutOutlined />} onClick={handleLogout}>
                Logout
            </Menu.Item>
        </Menu>
    );

    if (loading) {
        return <div style={{ padding: '50px', textAlign: 'center' }}>Loading...</div>;
    }

    if (!isAuthenticated) {
        return (
            <Router>
                <Routes>
                    <Route path="/login" element={<LoginPage setIsAuthenticated={setIsAuthenticated} setUser={setUser} />} />
                    <Route path="*" element={<Navigate to="/login" />} />
                </Routes>
            </Router>
        );
    }

    return (
        <Router>
            <Layout style={{ minHeight: '100vh' }}>
                <Sider 
                    collapsible 
                    collapsed={collapsed} 
                    onCollapse={setCollapsed}
                    style={{ position: 'fixed', left: 0, top: 0, bottom: 0, overflowY: 'auto' }}
                >
                    <div className="logo" style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', padding: '16px', textAlign: 'center' }}>
                        {!collapsed && <span>CloudMTA</span>}
                    </div>
                    <Menu
                        theme="dark"
                        mode="inline"
                        defaultSelectedKeys={['dashboard']}
                        items={[
                            {
                                key: 'dashboard',
                                icon: <DashboardOutlined />,
                                label: 'Dashboard',
                                onClick: () => window.location.href = '/'
                            },
                            {
                                key: 'domains',
                                icon: <CopyOutlined />,
                                label: 'Domains',
                                onClick: () => window.location.href = '/domains'
                            },
                            {
                                key: 'users',
                                icon: <UserOutlined />,
                                label: 'Users',
                                onClick: () => window.location.href = '/users'
                            },
                            {
                                key: 'queues',
                                icon: <MailOutlined />,
                                label: 'Message Queue',
                                onClick: () => window.location.href = '/queues'
                            },
                            {
                                key: 'analytics',
                                icon: <BarChartOutlined />,
                                label: 'Analytics',
                                onClick: () => window.location.href = '/analytics'
                            }
                        ]}
                    />
                </Sider>
                <Layout style={{ marginLeft: collapsed ? 80 : 200 }}>
                    <Header style={{ background: '#fff', padding: '0 16px', boxShadow: '0 1px 4px rgba(0,0,0,.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '500' }}>CloudMTA Admin Portal</div>
                        <Dropdown menu={{ items: [] }} overlay={userMenu} trigger={['click']}>
                            <Button type="text" icon={<UserOutlined />}>{user?.email}</Button>
                        </Dropdown>
                    </Header>
                    <Content style={{ margin: '24px 16px', background: '#fff', borderRadius: '2px' }}>
                        <Routes>
                            <Route path="/" element={
                                <ProtectedRoute isAuthenticated={isAuthenticated}>
                                    <DashboardPage />
                                </ProtectedRoute>
                            } />
                            <Route path="/domains" element={
                                <ProtectedRoute isAuthenticated={isAuthenticated}>
                                    <DomainsPage />
                                </ProtectedRoute>
                            } />
                            <Route path="/users" element={
                                <ProtectedRoute isAuthenticated={isAuthenticated}>
                                    <UsersPage />
                                </ProtectedRoute>
                            } />
                            <Route path="/queues" element={
                                <ProtectedRoute isAuthenticated={isAuthenticated}>
                                    <QueuesPage />
                                </ProtectedRoute>
                            } />
                            <Route path="/analytics" element={
                                <ProtectedRoute isAuthenticated={isAuthenticated}>
                                    <AnalyticsPage />
                                </ProtectedRoute>
                            } />
                            <Route path="/settings" element={
                                <ProtectedRoute isAuthenticated={isAuthenticated}>
                                    <SettingsPage />
                                </ProtectedRoute>
                            } />
                            <Route path="*" element={<Navigate to="/" />} />
                        </Routes>
                    </Content>
                    <Footer style={{ textAlign: 'center', background: '#f0f2f5' }}>
                        CloudMTA &copy; 2026. Professional Email MTA Server.
                    </Footer>
                </Layout>
            </Layout>
        </Router>
    );
}

export default App;
