import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMessages } from '../hooks/useMessages';
import {
  Send,
  LogOut,
  Users,
  MessageCircle,
  Search,
  Phone,
  Video,
  MoreVertical,
  Smile,
  Paperclip,
  Check,
  CheckCheck,
  ArrowLeft
} from 'lucide-react';



export default function Chat() {
  const { user, logout } = useAuth();
  const { conversations, sendMessage, getConversation, markAsRead } = useMessages(user?.username);
  const navigate = useNavigate();
  
  const [selectedChat, setSelectedChat] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileList, setShowMobileList] = useState(true);
  
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  const conversation = selectedChat ? getConversation(selectedChat.username) : [];

  useEffect(() => {
    if (selectedChat) {
      markAsRead(selectedChat.username);
    }
  }, [selectedChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedChat) return;

    await sendMessage(selectedChat.username, messageText.trim());
    setMessageText('');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return format(date, 'HH:mm', { locale: fa });
    } else if (isYesterday(date)) {
      return 'دیروز';
    } else {
      return format(date, 'dd/MM', { locale: fa });
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!user) {
    navigate('/');
    return null;
  }

  return (
    <div className="h-screen flex bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 overflow-hidden">
      {/* پس‌زمینه متحرک */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-1/4 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      {/* لیست گفتگوها - سمت راست */}
      <div className={`${showMobileList ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 lg:w-96 bg-white/5 backdrop-blur-xl border-l border-white/10 relative z-10`}>
        {/* هدر */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg">
                {user.displayName?.charAt(0) || user.username?.charAt(0)}
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">{user.displayName}</h2>
                <p className="text-white/60 text-xs">@{user.username}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
              title="خروج"
            >
              <LogOut className="w-5 h-5 text-white/60 group-hover:text-red-400 transition-colors" />
            </button>
          </div>

          {/* جستجو */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder="جستجو در گفتگوها..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pr-10 pl-4 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
              dir="rtl"
            />
          </div>
        </div>

        {/* لیست گفتگوها */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">هیچ گفتگویی ندارید</p>
              <p className="text-white/30 text-xs mt-1">برای شروع چت، یک کاربر جدید پیدا کنید</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.username}
                onClick={() => {
                  setSelectedChat(conv);
                  setShowMobileList(false);
                }}
                className={`w-full p-3 rounded-xl transition-all duration-300 text-right ${
                  selectedChat?.username === conv.username
                    ? 'bg-gradient-to-r from-purple-600/30 to-blue-600/30 border border-purple-500/30'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
                      {conv.avatar || conv.displayName.charAt(0)}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-gray-900 ${
                      conv.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                    }`}></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-medium truncate">{conv.displayName}</h3>
                      <span className="text-white/40 text-xs mr-2">{formatTime(conv.lastMessage.timestamp)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-white/60 text-sm truncate">{conv.lastMessage.content}</p>
                      {conv.unreadCount > 0 && (
                        <span className="bg-gradient-to-r from-purple-500 to-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full mr-2">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* پنجره چت - سمت چپ */}
      <div className={`${!showMobileList ? 'flex' : 'hidden'} md:flex flex-col flex-1 relative z-10`}>
        {selectedChat ? (
          <>
            {/* هدر چت */}
            <div className="p-4 bg-white/5 backdrop-blur-xl border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowMobileList(true)}
                    className="md:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-white" />
                  </button>
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
                    {selectedChat.avatar || selectedChat.displayName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-white font-bold">{selectedChat.displayName}</h3>
                    <p className="text-white/60 text-xs flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${
                        selectedChat.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                      }`}></div>
                      {selectedChat.status === 'online' ? 'آنلاین' : 'آفلاین'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors hidden sm:block">
                    <Phone className="w-5 h-5 text-white/60 hover:text-green-400 transition-colors" />
                  </button>
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors hidden sm:block">
                    <Video className="w-5 h-5 text-white/60 hover:text-blue-400 transition-colors" />
                  </button>
                  <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <MoreVertical className="w-5 h-5 text-white/60" />
                  </button>
                </div>
              </div>
            </div>

            {/* پیام‌ها */}
            <div 
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
              style={{ backgroundImage: 'url(/chat-bg.png)', backgroundSize: 'cover' }}
            >
              {conversation.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-500 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <MessageCircle className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">شروع گفتگو</h3>
                  <p className="text-white/60 text-sm">اولین پیام خود را به {selectedChat.displayName} بفرستید</p>
                </div>
              ) : (
                conversation.map((msg, index) => {
                  const isOwn = msg.sender === user.username;
                  const showAvatar = index === 0 || conversation[index - 1]?.sender !== msg.sender;

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-4' : ''}`}
                    >
                      {!isOwn && showAvatar && (
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-xs font-bold ml-2 shadow-lg">
                          {selectedChat.displayName.charAt(0)}
                        </div>
                      )}
                      {!isOwn && !showAvatar && <div className="w-8 ml-2"></div>}
                      
                      <div className={`max-w-xs sm:max-w-md lg:max-w-lg ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div
                          className={`px-4 py-3 rounded-2xl shadow-lg ${
                            isOwn
                              ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-br-md'
                              : 'bg-white/10 backdrop-blur-sm text-white rounded-bl-md border border-white/10'
                          }`}
                        >
                          <p className="text-sm leading-relaxed">{msg.content}</p>
                        </div>
                        <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-white/40 text-xs">{formatTime(msg.timestamp)}</span>
                          {isOwn && (
                            msg.read ? (
                              <CheckCheck className="w-3 h-3 text-blue-400" />
                            ) : (
                              <Check className="w-3 h-3 text-white/40" />
                            )
                          )}
                        </div>
                      </div>

                      {isOwn && showAvatar && (
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center text-white text-xs font-bold mr-2 shadow-lg">
                          {user.displayName.charAt(0)}
                        </div>
                      )}
                      {isOwn && !showAvatar && <div className="w-8 mr-2"></div>}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ورودی پیام */}
            <div className="p-4 bg-white/5 backdrop-blur-xl border-t border-white/10">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-3 hover:bg-white/10 rounded-xl transition-colors hidden sm:block"
                >
                  <Paperclip className="w-5 h-5 text-white/60 hover:text-purple-400 transition-colors" />
                </button>
                
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="پیام خود را بنویسید..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    dir="rtl"
                  />
                </div>

                <button
                  type="button"
                  className="p-3 hover:bg-white/10 rounded-xl transition-colors hidden sm:block"
                >
                  <Smile className="w-5 h-5 text-white/60 hover:text-yellow-400 transition-colors" />
                </button>

                <button
                  type="submit"
                  disabled={!messageText.trim()}
                  className="p-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-blue-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg animate-pulse">
                <MessageCircle className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-white font-bold text-2xl mb-3">به SoulMate خوش آمدید</h2>
              <p className="text-white/60 text-lg mb-2">یک گفتگو را انتخاب کنید یا</p>
              <p className="text-white/40 text-sm">شروع به چت با دوستان خود کنید</p>
              
              <div className="mt-8 flex items-center justify-center gap-4 text-white/30 text-xs">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>رمزنگاری سرتاسری</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>امنیت کامل</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>حریم خصوصی</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
