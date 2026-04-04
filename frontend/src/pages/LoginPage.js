import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Row, Col } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const LoginPage = ({ setIsAuthenticated, setUser }) => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const onFinish = async (values) => {
        setLoading(true);
        try {
            const response = await axios.post('/api/v1/auth/login', {
                email: values.email,
                password: values.password
            });

            const { access_token, refresh_token } = response.data;

            // Store tokens
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);

            // Set default header
            axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

            // Fetch user info
            const userResponse = await axios.get('/api/v1/auth/me');
            setUser(userResponse.data);
            setIsAuthenticated(true);

            message.success('Login successful!');
            navigate('/');
        } catch (error) {
            message.error(error.response?.data?.detail || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
            <Row gutter={[16, 16]} style={{ width: '100%', maxWidth: '1200px', padding: '20px' }}>
                <Col xs={24} sm={24} md={12} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ color: 'white', textAlign: 'center' }}>
                        <h1 style={{ fontSize: '48px', marginBottom: '16px' }}>CloudMTA</h1>
                        <p style={{ fontSize: '18px', marginBottom: '24px' }}>Professional Email MTA Server</p>
                        <div style={{ fontSize: '14px', lineHeight: '1.8' }}>
                            <p>✓ Bulk Email Support</p>
                            <p>✓ IPv4 & IPv6 Rotation</p>
                            <p>✓ SPF, DKIM, DMARC Support</p>
                            <p>✓ Advanced Analytics</p>
                        </div>
                    </div>
                </Col>
                
                <Col xs={24} sm={24} md={12}>
                    <Card style={{
                        borderRadius: '8px',
                        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Admin Login</h2>
                        
                        <Form
                            layout="vertical"
                            onFinish={onFinish}
                            autoComplete="off"
                        >
                            <Form.Item
                                label="Email"
                                name="email"
                                rules={[
                                    { required: true, message: 'Please enter your email' },
                                    { type: 'email', message: 'Invalid email format' }
                                ]}
                            >
                                <Input
                                    placeholder="admin@localhost"
                                    prefix={<MailOutlined />}
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item
                                label="Password"
                                name="password"
                                rules={[
                                    { required: true, message: 'Please enter your password' },
                                    { min: 8, message: 'Password must be at least 8 characters' }
                                ]}
                            >
                                <Input.Password
                                    placeholder="Enter your password"
                                    prefix={<LockOutlined />}
                                    size="large"
                                />
                            </Form.Item>

                            <Form.Item>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    block
                                    size="large"
                                    loading={loading}
                                    style={{
                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                        border: 'none',
                                        height: '40px',
                                        fontSize: '16px'
                                    }}
                                >
                                    {loading ? 'Logging in...' : 'Login'}
                                </Button>
                            </Form.Item>
                        </Form>

                        <div style={{
                            marginTop: '24px',
                            padding: '16px',
                            background: '#f5f5f5',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }}>
                            <p><strong>Demo Credentials:</strong></p>
                            <p>Email: admin@localhost</p>
                            <p>Password: ChangeMe123!</p>
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default LoginPage;
