const getForgotPasswordTemplate = (resetLink, userName = 'User') => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Artleap Password</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
            color: #2D3748;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 580px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
            backdrop-filter: blur(10px);
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            padding: 50px 40px 40px;
            text-align: center;
            color: white;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0,0 L100,0 L100,100 Z" fill="rgba(255,255,255,0.1)"/></svg>');
            background-size: cover;
        }
        
        .logo-container {
            position: relative;
            z-index: 2;
        }
        
        .logo {
            font-size: 42px;
            font-weight: 800;
            margin-bottom: 8px;
            letter-spacing: -1px;
            background: linear-gradient(135deg, #FFFFFF 0%, #F0F4FF 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        .company {
            font-size: 16px;
            opacity: 0.9;
            font-weight: 500;
            letter-spacing: 0.5px;
        }
        
        .content {
            padding: 50px 40px;
            background: #ffffff;
        }
        
        .greeting {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 24px;
            color: #1A202C;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .message {
            font-size: 16px;
            color: #4A5568;
            margin-bottom: 32px;
            line-height: 1.7;
        }
        
        .reset-section {
            background: linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%);
            border-radius: 20px;
            padding: 32px;
            margin: 32px 0;
            border: 1px solid #e2e8f0;
            text-align: center;
        }
        
        .reset-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 18px 48px;
            text-decoration: none;
            border-radius: 16px;
            font-weight: 700;
            font-size: 16px;
            text-align: center;
            margin: 16px 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
            position: relative;
            overflow: hidden;
        }
        
        .reset-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            transition: left 0.5s;
        }
        
        .reset-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 35px rgba(102, 126, 234, 0.6);
        }
        
        .reset-button:hover::before {
            left: 100%;
        }
        
        .link-container {
            background: #f8fafc;
            border-radius: 12px;
            padding: 20px;
            margin: 24px 0;
            border-left: 4px solid #667eea;
            position: relative;
        }
        
        .link-text {
            word-break: break-all;
            font-size: 14px;
            color: #4A5568;
            font-family: 'Courier New', monospace;
            line-height: 1.5;
        }
        
        .copy-icon {
            position: absolute;
            top: 16px;
            right: 16px;
            background: #667eea;
            color: white;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .copy-icon:hover {
            background: #5a6fd8;
        }
        
        .info-cards {
            display: grid;
            gap: 20px;
            margin: 32px 0;
        }
        
        .info-card {
            padding: 20px;
            border-radius: 16px;
            display: flex;
            align-items: flex-start;
            gap: 16px;
        }
        
        .expiry-note {
            background: linear-gradient(135deg, #fffaf0 0%, #fff5e6 100%);
            border: 1px solid #fed7aa;
            color: #c05621;
        }
        
        .support {
            background: linear-gradient(135deg, #f0fff4 0%, #e6fffa 100%);
            border: 1px solid #9ae6b4;
            color: #276749;
        }
        
        .icon {
            font-size: 20px;
            flex-shrink: 0;
            margin-top: 2px;
        }
        
        .card-content {
            flex: 1;
        }
        
        .card-content strong {
            display: block;
            margin-bottom: 8px;
            font-size: 15px;
        }
        
        .footer {
            background: linear-gradient(135deg, #1A202C 0%, #2D3748 100%);
            padding: 40px;
            text-align: center;
            color: #A0AEC0;
        }
        
        .social-links {
            margin: 24px 0;
            display: flex;
            justify-content: center;
            gap: 20px;
        }
        
        .social-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 44px;
            height: 44px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: #CBD5E0;
            text-decoration: none;
            transition: all 0.3s ease;
            font-weight: 600;
            font-size: 14px;
        }
        
        .social-link:hover {
            background: #667eea;
            color: white;
            transform: translateY(-2px);
        }
        
        .copyright {
            margin-top: 24px;
            font-size: 13px;
            opacity: 0.8;
            line-height: 1.6;
        }
        
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, #E2E8F0, transparent);
            margin: 32px 0;
        }
        
        @media (max-width: 620px) {
            body {
                padding: 10px;
            }
            
            .container {
                border-radius: 20px;
            }
            
            .header {
                padding: 40px 24px 32px;
            }
            
            .content {
                padding: 40px 24px;
            }
            
            .logo {
                font-size: 36px;
            }
            
            .greeting {
                font-size: 24px;
            }
            
            .reset-section {
                padding: 24px;
            }
            
            .reset-button {
                padding: 16px 32px;
                display: block;
            }
            
            .social-links {
                gap: 12px;
            }
            
            .social-link {
                width: 40px;
                height: 40px;
            }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .container {
            animation: fadeIn 0.6s ease-out;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-container">
                <div class="logo">Artleap</div>
                <div class="company">by Xr Digital</div>
            </div>
        </div>
        
        <div class="content">
            <h1 class="greeting">Hello ${userName},</h1>
            
            <p class="message">
                We received a request to reset your password for your Artleap account. 
                Click the button below to securely create a new password and regain access to your creative workspace.
            </p>
            
            <div class="reset-section">
                <p class="message" style="margin-bottom: 0; color: #667eea; font-weight: 500;">
                    Ready to continue your creative journey?
                </p>
                <a href="${resetLink}" class="reset-button">Reset Your Password</a>
                <p style="font-size: 14px; color: #718096; margin-top: 16px;">
                    This link will securely redirect you to our password reset page
                </p>
            </div>
            
            <p class="message">
                If the button doesn't work, copy and paste this secure link into your browser:
            </p>
            
            <div class="link-container">
                <div class="link-text">${resetLink}</div>
                <div class="copy-icon" onclick="navigator.clipboard.writeText('${resetLink}')">Copy</div>
            </div>
            
            <div class="info-cards">
                <div class="info-card expiry-note">
                    <div class="icon">⏰</div>
                    <div class="card-content">
                        <strong>Security Notice</strong>
                        This password reset link is valid for 1 hour. For your security, please reset your password immediately and do not share this link with anyone.
                    </div>
                </div>
                
                <div class="info-card support">
                    <div class="icon">💫</div>
                    <div class="card-content">
                        <strong>Need Assistance?</strong>
                        If you didn't request this password reset or encounter any issues, our support team is here to help at support@xrdigital.com. We typically respond within 1-2 hours.
                    </div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <p class="message" style="text-align: center; font-style: italic; color: #667eea;">
                "Unleash your creativity with Artleap - where imagination meets innovation"
            </p>
            
            <p class="message" style="text-align: center; margin-bottom: 0;">
                Thank you for being part of our creative community!<br>
                <strong style="color: #667eea;">The Artleap Team</strong>
            </p>
        </div>
        
        <div class="footer">
            <div class="copyright">
                &copy; 2024 Xr Digital. All rights reserved.<br>
                Creating the future of digital art, one masterpiece at a time.<br>
                <span style="opacity: 0.6; font-size: 12px; margin-top: 8px; display: block;">
                    Empower Your Creativity • Innovate With AI • Create Without Limits
                </span>
            </div>
        </div>
    </div>

    <script>
        // Simple copy functionality for email clients that support minimal JS
        document.addEventListener('DOMContentLoaded', function() {
            const copyIcons = document.querySelectorAll('.copy-icon');
            copyIcons.forEach(icon => {
                icon.addEventListener('click', function() {
                    const linkText = this.parentElement.querySelector('.link-text').textContent;
                    navigator.clipboard.writeText(linkText).then(() => {
                        const originalText = this.textContent;
                        this.textContent = 'Copied!';
                        setTimeout(() => {
                            this.textContent = originalText;
                        }, 2000);
                    });
                });
            });
        });
    </script>
</body>
</html>
  `;
};

module.exports = { getForgotPasswordTemplate };