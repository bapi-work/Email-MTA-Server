import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Switch, Button, message, Spin, Tabs } from 'antd';
import axios from 'axios';

const SettingsPage = () => {
    const [loading, setLoading] = useState(true);
    const [smtpSettings, setSmtpSettings] = useState(null);
    const [authSettings, setAuthSettings] = useState(null);
    const [form] = Form.useForm();

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const [smtpRes, authRes] = await Promise.all([
                axios.get('/api/v1/smtp/config'),
                axios.get('/api/v1/smtp/authentication')
            ]);

            setSmtpSettings(smtpRes.data);
            setAuthSettings(authRes.data);
        } catch (error) {
            message.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <Spin size="large" />;
    }

    return (
        <div className="content-wrapper">
            <h1>Settings</h1>
            
            <Tabs items={[
                {
                    key: 'smtp',
                    label: 'SMTP Settings',
                    children: (
                        <Card>
                            <Form layout="vertical">
                                <Form.Item label="SMTP Hostname">
                                    <Input value={smtpSettings?.hostname} disabled />
                                </Form.Item>
                                <Form.Item label="SMTP Port">
                                    <Input value={smtpSettings?.ports?.smtp} disabled />
                                </Form.Item>
                                <Form.Item label="TLS Port">
                                    <Input value={smtpSettings?.ports?.submission} disabled />
                                </Form.Item>
                                <Form.Item label="SSL Port">
                                    <Input value={smtpSettings?.ports?.smtps} disabled />
                                </Form.Item>
                                <Form.Item label="Max Connections">
                                    <Input value={smtpSettings?.max_connections} disabled />
                                </Form.Item>
                                <Form.Item label="Timeout (seconds)">
                                    <Input value={smtpSettings?.timeout} disabled />
                                </Form.Item>
                                <Form.Item label="Queue Size">
                                    <Input value={smtpSettings?.queue_size} disabled />
                                </Form.Item>
                                <Form.Item label="IPv4 Enabled" valuePropName="checked">
                                    <Switch checked={smtpSettings?.ipv4_enabled} disabled />
                                </Form.Item>
                                <Form.Item label="IPv6 Enabled" valuePropName="checked">
                                    <Switch checked={smtpSettings?.ipv6_enabled} disabled />
                                </Form.Item>
                                <Form.Item label="IP Rotation" valuePropName="checked">
                                    <Switch checked={smtpSettings?.ip_rotation_enabled} disabled />
                                </Form.Item>
                            </Form>
                        </Card>
                    )
                },
                {
                    key: 'auth',
                    label: 'Authentication',
                    children: (
                        <Card>
                            <Form layout="vertical">
                                <Form.Item label="SPF Enabled" valuePropName="checked">
                                    <Switch checked={authSettings?.spf_enabled} disabled />
                                </Form.Item>
                                <Form.Item label="DKIM Enabled" valuePropName="checked">
                                    <Switch checked={authSettings?.dkim_enabled} disabled />
                                </Form.Item>
                                <Form.Item label="DMARC Enabled" valuePropName="checked">
                                    <Switch checked={authSettings?.dmarc_enabled} disabled />
                                </Form.Item>
                                <Form.Item label="SPF Check" valuePropName="checked">
                                    <Switch checked={authSettings?.spf_check_enabled} disabled />
                                </Form.Item>
                                <Form.Item label="DKIM Signing" valuePropName="checked">
                                    <Switch checked={authSettings?.dkim_signing_enabled} disabled />
                                </Form.Item>
                            </Form>
                        </Card>
                    )
                },
                {
                    key: 'general',
                    label: 'General',
                    children: (
                        <Card>
                            <Form layout="vertical">
                                <Form.Item label="System Information">
                                    <p>CloudMTA v1.0.0</p>
                                </Form.Item>
                                <Form.Item label="Database">
                                    <p>PostgreSQL</p>
                                </Form.Item>
                                <Form.Item label="Cache">
                                    <p>Redis</p>
                                </Form.Item>
                            </Form>
                        </Card>
                    )
                }
            ]} />
        </div>
    );
};

export default SettingsPage;
