import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Form, Input, Button, message, Divider, Tabs, Tag } from 'antd';
import {
    UserOutlined,
    MailOutlined,
    LockOutlined,
    SaveOutlined,
    SafetyCertificateOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import axios from 'axios';

const COLORS = {
    primary: '#4f46e5',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    secondary: '#7c3aed'
};

const InfoRow = ({ label, value, icon }) => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 0', borderBottom: '1px solid #f1f5f9'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontSize: 13 }}>
            <span style={{ color: COLORS.primary }}>{icon}</span>
            <span>{label}</span>
        </div>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{value || '—'}</span>
    </div>
);

const ProfilePage = ({ user: propUser }) => {
    const [user, setUser] = useState(propUser || null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [profileForm] = Form.useForm();
    const [passwordForm] = Form.useForm();

    useEffect(() => {
        fetchUser();
    }, []);

    const fetchUser = async () => {
        try {
            const res = await axios.get('/api/v1/auth/me');
            setUser(res.data);
            profileForm.setFieldsValue({
                username: res.data.username,
                email: res.data.email,
                full_name: res.data.full_name
            });
        } catch {
            message.error('Failed to load profile');
        }
    };

    const handleUpdateProfile = async (values) => {
        setProfileLoading(true);
        try {
            await axios.put('/api/v1/auth/me/profile', {
                email: values.email,
                username: values.username,
                full_name: values.full_name
            });
            message.success('Profile updated successfully');
            fetchUser();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to update profile');
        } finally {
            setProfileLoading(false);
        }
    };

    const handleChangePassword = async (values) => {
        setPasswordLoading(true);
        try {
            await axios.post('/api/v1/auth/change-password', {
                current_password: values.current_password,
                new_password: values.new_password
            });
            message.success('Password changed successfully');
            passwordForm.resetFields();
        } catch (err) {
            message.error(err.response?.data?.detail || 'Failed to change password');
        } finally {
            setPasswordLoading(false);
        }
    };

    const initials = user?.username
        ? user.username.slice(0, 2).toUpperCase()
        : user?.email?.slice(0, 2).toUpperCase() || 'AD';

    const roleColor = user?.role === 'admin' ? COLORS.primary : COLORS.success;

    return (
        <div className="content-wrapper">
            <div style={{ marginBottom: 24 }}>
                <h1 className="page-title">My Profile</h1>
                <p className="page-subtitle">Manage your account information and security settings</p>
            </div>

            <Row gutter={[20, 20]}>
                {/* Left: Avatar card */}
                <Col xs={24} md={8} lg={7}>
                    <Card>
                        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
                            <div className="profile-avatar-large">{initials}</div>
                            <div style={{ fontSize: 19, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                                {user?.full_name || user?.username || 'Admin User'}
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>{user?.email}</div>
                            <Tag
                                style={{
                                    background: `${roleColor}15`,
                                    color: roleColor,
                                    border: `1px solid ${roleColor}30`,
                                    borderRadius: 20,
                                    padding: '3px 14px',
                                    fontWeight: 600,
                                    textTransform: 'capitalize',
                                    fontSize: 12
                                }}
                            >
                                {user?.role || 'user'}
                            </Tag>
                        </div>

                        <Divider style={{ margin: '12px 0' }} />

                        <InfoRow label="Username" value={user?.username} icon={<UserOutlined />} />
                        <InfoRow label="Role" value={user?.role} icon={<SafetyCertificateOutlined />} />
                        <InfoRow
                            label="Status"
                            value={user?.is_active ? 'Active' : 'Inactive'}
                            icon={<SafetyCertificateOutlined />}
                        />
                        <InfoRow
                            label="Member Since"
                            value={user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null}
                            icon={<CalendarOutlined />}
                        />

                        <Divider style={{ margin: '12px 0' }} />

                        <div style={{
                            background: 'rgba(16,185,129,0.08)',
                            borderRadius: 8,
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                        }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: COLORS.success, flexShrink: 0
                            }} />
                            <span style={{ fontSize: 12, color: '#065f46', fontWeight: 500 }}>
                                Session Active — Auto-logout after 3 min idle
                            </span>
                        </div>
                    </Card>
                </Col>

                {/* Right: Edit tabs */}
                <Col xs={24} md={16} lg={17}>
                    <Card bodyStyle={{ padding: 0 }}>
                        <Tabs
                            defaultActiveKey="profile"
                            tabBarStyle={{ padding: '0 24px', marginBottom: 0 }}
                            items={[
                                {
                                    key: 'profile',
                                    label: (
                                        <span>
                                            <UserOutlined />
                                            &nbsp;Profile Info
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ padding: '24px' }}>
                                            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                                                Update your display name, username, and email address.
                                            </p>
                                            <Form
                                                form={profileForm}
                                                layout="vertical"
                                                onFinish={handleUpdateProfile}
                                            >
                                                <Row gutter={16}>
                                                    <Col xs={24} sm={12}>
                                                        <Form.Item
                                                            label="Full Name"
                                                            name="full_name"
                                                        >
                                                            <Input
                                                                prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                                                                placeholder="John Smith"
                                                                size="large"
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                    <Col xs={24} sm={12}>
                                                        <Form.Item
                                                            label="Username"
                                                            name="username"
                                                            rules={[{ required: true, message: 'Username is required' }]}
                                                        >
                                                            <Input
                                                                prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                                                                placeholder="admin"
                                                                size="large"
                                                            />
                                                        </Form.Item>
                                                    </Col>
                                                </Row>
                                                <Form.Item
                                                    label="Email Address"
                                                    name="email"
                                                    rules={[
                                                        { required: true, message: 'Email is required' },
                                                        { type: 'email', message: 'Enter a valid email' }
                                                    ]}
                                                >
                                                    <Input
                                                        prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                                                        placeholder="admin@yourdomain.com"
                                                        size="large"
                                                    />
                                                </Form.Item>
                                                <Form.Item style={{ marginBottom: 0 }}>
                                                    <Button
                                                        type="primary"
                                                        htmlType="submit"
                                                        loading={profileLoading}
                                                        icon={<SaveOutlined />}
                                                        size="large"
                                                    >
                                                        Save Changes
                                                    </Button>
                                                </Form.Item>
                                            </Form>
                                        </div>
                                    )
                                },
                                {
                                    key: 'security',
                                    label: (
                                        <span>
                                            <LockOutlined />
                                            &nbsp;Security
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ padding: '24px' }}>
                                            <div style={{
                                                background: '#fef3c7', border: '1px solid #fde68a',
                                                borderRadius: 8, padding: '12px 16px', marginBottom: 24
                                            }}>
                                                <p style={{ margin: 0, fontSize: 13, color: '#92400e' }}>
                                                    <strong>Security tip:</strong> Use a strong password with at least 8 characters,
                                                    including uppercase, lowercase, numbers, and special characters.
                                                </p>
                                            </div>
                                            <Form
                                                form={passwordForm}
                                                layout="vertical"
                                                onFinish={handleChangePassword}
                                            >
                                                <Form.Item
                                                    label="Current Password"
                                                    name="current_password"
                                                    rules={[{ required: true, message: 'Enter your current password' }]}
                                                >
                                                    <Input.Password
                                                        prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                                                        placeholder="Enter current password"
                                                        size="large"
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    label="New Password"
                                                    name="new_password"
                                                    rules={[
                                                        { required: true, message: 'Enter a new password' },
                                                        { min: 8, message: 'Password must be at least 8 characters' }
                                                    ]}
                                                >
                                                    <Input.Password
                                                        prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                                                        placeholder="Minimum 8 characters"
                                                        size="large"
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    label="Confirm New Password"
                                                    name="confirm_password"
                                                    rules={[
                                                        { required: true, message: 'Confirm your new password' },
                                                        ({ getFieldValue }) => ({
                                                            validator(_, value) {
                                                                if (!value || getFieldValue('new_password') === value) {
                                                                    return Promise.resolve();
                                                                }
                                                                return Promise.reject(new Error('Passwords do not match'));
                                                            }
                                                        })
                                                    ]}
                                                >
                                                    <Input.Password
                                                        prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                                                        placeholder="Re-enter new password"
                                                        size="large"
                                                    />
                                                </Form.Item>
                                                <Form.Item style={{ marginBottom: 0 }}>
                                                    <Button
                                                        type="primary"
                                                        htmlType="submit"
                                                        loading={passwordLoading}
                                                        icon={<LockOutlined />}
                                                        size="large"
                                                    >
                                                        Update Password
                                                    </Button>
                                                </Form.Item>
                                            </Form>
                                        </div>
                                    )
                                }
                            ]}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default ProfilePage;
