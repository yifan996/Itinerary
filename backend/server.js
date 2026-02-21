const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const config = require('./config');
const { CozeAPI } = require('@coze/api');

const app = express();
const PORT = config.PORT || 3000;
const MONGODB_URI = config.MONGODB_URI || 'mongodb://localhost:27017/travelAssistant';

// 中间件
app.use(cors());
app.use(express.json());

// 连接MongoDB数据库（从 env.config.js 读取连接地址）
mongoose.connect(config.MONGODB_URI || 'mongodb://localhost:27017/travelAssistant', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB连接成功'))
.catch(err => console.error('MongoDB连接失败:', err));

// 定义数据模型
const UserProfile = mongoose.model('UserProfile', new mongoose.Schema({
    formData: {
        days: Number,
        e_anxious: Number,
        e_curious: Number,
        e_tired: Number
    },
    personality: {
        b5: [Number],  // Big Five
        p: [Number]    // 旅行偏好
    },
    createdAt: { type: Date, default: Date.now }
}));

const Itinerary = mongoose.model('Itinerary', new mongoose.Schema({
    days: Number,
    e_anxious: Number,
    e_curious: Number,
    e_tired: Number,
    u_profile: {
        b5: [Number],
        p: [Number]
    },
    // 【核心新增】存储完整的行程文本
    final_itinerary: {
        type: String,
        default: ''
    },
    tripType: String,
    matchPercentage: Number,
    totalActivities: Number,
    dailyActivities: [{
        day: Number,
        title: String,
        type: String,
        activities: [{
            id: Number,
            name: String,
            description: String
        }]
    }],
    recommendations: {
        dining: [String],
        shopping: [String]
    },
    createdAt: { type: Date, default: Date.now }
}));


const Survey = mongoose.model('Survey', new mongoose.Schema({
  itineraryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Itinerary', default: null },
  userId: { type: String, default: '' },

  // New 14-item Likert survey (1..5)
  survey: {
    q1: { type: Number, required: true },
    q2: { type: Number, required: true },
    q3: { type: Number, required: true },
    q4: { type: Number, required: true },
    q5: { type: Number, required: true },
    q6: { type: Number, required: true },
    q7: { type: Number, required: true },
    q8: { type: Number, required: true },
    q9: { type: Number, required: true },
    q10:{ type: Number, required: true },
    q11:{ type: Number, required: true },
    q12:{ type: Number, required: true },
    q13:{ type: Number, required: true },
    q14:{ type: Number, required: true },
  },

  createdAt: { type: Date, default: Date.now }
}));



// Coze API配置（后端存储，避免前端暴露）- 生成行程使用
const COZE_CONFIG = {
    url: 'https://api.coze.cn/v1/workflow/stream_run',
    token: config.COZE_API_TOKEN, // 改为从配置读取
    workflowId: '7568089470144839707'
};

// 【新增】创建官方SDK客户端实例 - 聊天使用
const cozeApiClient = new CozeAPI({
  token: config.COZE_API_TOKEN,
  baseURL: 'https://api.coze.cn'
});

// API路由（不变）
// 1. 生成行程（调用Coze API + 保存到MongoDB）
app.post('/api/generate-itinerary', async (req, res) => {
    try {
        const { days, e_anxious, e_curious, e_tired, u_profile } = req.body;

        console.log("发送到 Coze API 的数据:", req.body);

        // 调用 Coze API 获取行程数据
        const cozeResponse = await axios.post(COZE_CONFIG.url, {
            workflow_id: COZE_CONFIG.workflowId,
            parameters: {
                u_profile: {
                    b5: [0.7, 0.5, 0.6, 0.8, 0.3],
                    p: [0.4, 0.6, 0.7]
                },
                days: days,  
                e_tired: e_tired,  
                e_anxious: e_anxious,  
                e_curious: e_curious  
            }
        }, {
            headers: {
                'Authorization': `Bearer ${COZE_CONFIG.token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log("Coze API 响应状态:", cozeResponse.status);
        console.log("Coze API 响应内容:", cozeResponse.data);

        // 确保返回的数据包含有效的行程内容
        let finalItinerary = '';

        // 检查是否是 Message 事件，并且 content 包含行程内容
        if (cozeResponse.data.event == 'Message') { // && cozeResponse.data.content

            //如何从coze返回的结果中，提取出event == ‘Message’的，然后返回给前端进行渲染？上面这个条件式是提取不出来的，每次都返回“没有找到有效的行程内容”

            finalItinerary = cozeResponse.data;  // 提取行程内容 finalItinerary = cozeResponse.data.content
            console.log("提取到的行程内容:", finalItinerary);
} else {
    finalItinerary = cozeResponse.data  //临时
    console.log("没有找到有效的行程内容:", cozeResponse.data);
}

// ========== 【新增】保存行程到 MongoDB ==========
let savedItineraryId = null;

try {
    const itineraryDoc = new Itinerary({
        days: days,
        e_anxious: e_anxious,
        e_curious: e_curious,
        e_tired: e_tired,
        u_profile: u_profile || { b5: [0.7, 0.5, 0.6, 0.8, 0.3], p: [0.4, 0.6, 0.7] },
        final_itinerary: finalItinerary,
        createdAt: new Date()
    });
    
    const savedDoc = await itineraryDoc.save();
    savedItineraryId = savedDoc._id;
    console.log(`行程已保存至MongoDB，文档ID: ${savedDoc._id}`);
    
} catch (saveError) {
    console.error("保存到数据库失败:", saveError.message);
    // 注意：这里不抛出错误，保证前端正常收到行程
}

// 返回行程给前端
res.json({
    success: true,
    itineraryId: savedItineraryId,
    itinerary: { final_itinerary: finalItinerary }
});

    } catch (error) {
        console.error('生成行程错误:', error);
        let errorMessage = '未知错误，请稍后再试。';
        if (error.response) {
            errorMessage = error.response.data?.message || 'Coze API 调用失败。';
        } else if (error.request) {
            errorMessage = '网络错误，无法连接到服务器。请检查网络连接并重试。';
        } else {
            errorMessage = `发生错误: ${error.message}`;
        }
        res.status(500).json({
            success: false,
            message: errorMessage
        });
    }
});



// 2. 保存用户配置
app.post('/api/save-profile', async (req, res) => {
    try {
        const profile = new UserProfile(req.body);
        await profile.save();
        res.json({ success: true, message: '配置保存成功' });
    } catch (error) {
        res.status(500).json({ success: false, message: '数据库保存失败' });
    }
});

// 3. 获取行程历史
app.get('/api/itinerary-history', async (req, res) => {
    try {
        const itineraries = await Itinerary.find()
            .sort({ createdAt: -1 })
            .limit(10);
        res.json(itineraries);
    } catch (error) {
        res.status(500).json({ success: false, message: '查询历史行程失败' });
    }
});

// 4. 保存问卷
app.post('/api/save-survey', async (req, res) => {
  try {
    const { itineraryId, userId, survey } = req.body || {};

    if (!survey) {
      return res.status(400).json({ success: false, message: 'Missing survey' });
    }

    // Validate q1..q14 are integers 1..5
    const missing = [];
    const invalid = [];

    for (let i = 1; i <= 14; i++) {
      const k = 'q' + i;
      const v = survey[k];

      if (v === null || v === undefined) {
        missing.push(k);
        continue;
      }
      const num = Number(v);
      const isInt = Number.isInteger(num);
      if (!isInt || num < 1 || num > 5) invalid.push(`${k}=${v}`);
    }

    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing answers: ${missing.join(', ')}` });
    }
    if (invalid.length) {
      return res.status(400).json({ success: false, message: `Invalid answers (must be 1..5): ${invalid.join(', ')}` });
    }

    const doc = new Survey({
      itineraryId: itineraryId || null,
      userId: userId || '',
      survey: survey
    });

    const saved = await doc.save();
    return res.json({ success: true, surveyId: saved._id });

  } catch (err) {
    console.error('保存问卷失败:', err);
    return res.status(500).json({ success: false, message: '保存问卷失败' });
  }
});


app.get('/api/survey-history', async (req, res) => {
  const list = await Survey.find().sort({ createdAt: -1 }).limit(20);
  res.json(list);
});


// 后端聊天接口 (使用官方SDK)
app.post('/api/chat', async (req, res) => {
    console.log("=== 收到聊天请求（使用官方SDK） ===");
    
    const { message, itineraryText, conversationId, userId } = req.body;

    // 1. 基础验证
    if (!message || !itineraryText) {
        return res.status(400).json({ 
            success: false, 
            reply: '请提供问题和行程文本。' 
        });
    }

    // 2. 准备对话消息（将行程文本作为上下文）
    const userMessageContent = `你是一个专业的旅行助手。请严格根据以下用户的旅行行程来回答问题。
<行程开始>
${itineraryText.substring(0, 800)}
<行程结束>
用户关于此行程的问题是：${message}
请直接给出答案，无需复述行程或问题。`;

    try {
        // 3. 调用官方 SDK 的 stream 方法
        const streamResponse = await cozeApiClient.chat.stream({
            bot_id: config.COZE_BOT_ID,
            user_id: userId || 'user_' + Date.now(),
            conversation_id: conversationId || undefined,
            additional_messages: [
                {
                    "content": userMessageContent,
                    "content_type": "text",
                    "role": "user"
                    // 移除了 "type": "question"，部分模型可能不识别此字段
                }
            ],
        });

        console.log('SDK stream 方法调用成功，开始接收流式响应...');
        
        // 4. 处理流式响应并收集最终消息
        let finalContent = '';
        let currentConversationId = conversationId;
        let eventCount = 0; // 用于计数
        

for await (const event of streamResponse) {
    eventCount++;

    // 1. 提取内容：核心修正点
    if (event.event === 'conversation.message.completed' && event.data && event.data.role === 'assistant') {
        console.log(`[${eventCount}] 捕获到AI回复。类型: ${event.data.type}, 内容长度: ${event.data.content?.length || 0}`);

        if (event.data.content) {
            // 这里可以根据类型处理，例如只累积非follow_up的内容，或全部累积
            // 方案A：累积所有AI的文本回复
            finalContent += event.data.content + '\n'; // 用换行分隔多条回复

            // 方案B：如果你想过滤掉“追问”，可以这样：
            // if (event.data.type !== 'follow_up') {
            //     finalContent = event.data.content; // 或者用 +=
            // }
        }
    }

    // 2. 更新会话ID
    if (event.conversation_id) {
        currentConversationId = event.conversation_id;
    }
}

// 循环结束后，修剪多余的空格和换行
finalContent = finalContent.trim();
console.log(`[总结] 共处理 ${eventCount} 个事件，最终提取内容: “${finalContent}”`);
        console.log(`流式响应结束。共处理 ${eventCount} 个事件，最终内容长度: ${finalContent.length}`);
        
        

        // 6. 确保最终有内容返回
        if (!finalContent.trim()) {
            finalContent = '已收到请求,但AI未能生成有效回复,请尝试重新提问。';
            console.warn('警告：最终回复内容为空，使用默认提示。');
        } else {
            console.log('AI回复生成完成,内容:', finalContent.substring(0, 200) + (finalContent.length > 200 ? '...' : ''));
        }
        
        // 7. 返回结果给前端
        return res.json({
            success: true,
            reply: finalContent,
            conversation_id: currentConversationId
        });

    } catch (error) {
        // SDK 会抛出结构化的错误
        console.error('Coze SDK 调用错误详情:', error.message, error.code || '无错误码');
        return res.status(500).json({ 
            success: false, 
            reply: `请求失败: ${error.message || '请检查后端配置和网络后重试。'}` 
        });
    }
});

const path = require('path');

// 提供前端静态文件
app.use(express.static(path.join(__dirname, '../frontend')));

// 访问根路径返回 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`Node.js服务器启动成功!端口:${PORT}`);
    console.log(`后端API地址:http://localhost:${PORT}/api`);
});
