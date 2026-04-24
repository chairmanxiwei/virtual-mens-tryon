-- 数据库初始化脚本
-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS virtual_man_fashion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE virtual_man_fashion;

-- 创建clothes表
CREATE TABLE IF NOT EXISTS clothes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(100) NOT NULL,
    type VARCHAR(100) NOT NULL,
    image VARCHAR(500) NOT NULL,
    thumb VARCHAR(500),
    size VARCHAR(50),
    brand VARCHAR(100),
    material VARCHAR(100),
    style VARCHAR(100),
    season VARCHAR(100),
    suitable_temp VARCHAR(100),
    price DECIMAL(10, 2),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建outfit_suggestions表
CREATE TABLE IF NOT EXISTS outfit_suggestions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image VARCHAR(500) NOT NULL,
    thumb VARCHAR(500),
    occasion VARCHAR(100),
    season VARCHAR(100),
    style VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入一些示例数据
INSERT INTO outfit_suggestions (name, description, image, thumb, occasion, season, style) VALUES
('商务正装', '适合正式商务场合的经典搭配', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=business%20formal%20outfit%20men&image_size=square', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=business%20formal%20outfit%20men&image_size=square', '商务会议', '四季', '商务正式'),
('休闲时尚', '适合日常休闲的时尚搭配', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=casual%20fashion%20outfit%20men&image_size=square', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=casual%20fashion%20outfit%20men&image_size=square', '休闲聚会', '四季', '休闲时尚'),
('运动风格', '适合运动或户外活动的搭配', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=sports%20style%20outfit%20men&image_size=square', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=sports%20style%20outfit%20men&image_size=square', '户外运动', '四季', '运动风格'),
('晚宴着装', '适合正式晚宴的优雅搭配', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=evening%20dinner%20outfit%20men&image_size=square', 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=evening%20dinner%20outfit%20men&image_size=square', '正式晚宴', '四季', '经典优雅');
