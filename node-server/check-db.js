const mysql = require('mysql2/promise');
require('dotenv-flow').config({
    path: require('path').resolve(__dirname, '..'),
    node_env: process.env.NODE_ENV || 'development',
    silent: true
});

async function checkDatabase() {
    try {
        // 创建数据库连接
        const pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT || 3306),
            user: process.env.DB_USER,
            password: process.env.DB_PASS || process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        
        console.log('连接数据库...');
        
        // 查询clothes表中的数据
        const [rows] = await pool.query('SELECT * FROM clothes');
        console.log(`clothes表中有 ${rows.length} 条数据`);
        
        // 打印前5条数据
        console.log('前5条数据:');
        rows.slice(0, 5).forEach(row => {
            console.log(`ID: ${row.id}, Name: ${row.name}, User ID: ${row.user_id}`);
        });
        
        // 查询user_id为1的数据
        const [user1Rows] = await pool.query('SELECT * FROM clothes WHERE user_id = ?', [1]);
        console.log(`\nuser_id为1的衣物数量: ${user1Rows.length}`);
        
        // 关闭连接
        await pool.end();
        
    } catch (error) {
        console.error('数据库查询失败:', error.message);
    }
}

checkDatabase();
