// Check if the browser supports speech recognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    alert('Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari para melhor experiência.');
}

// DOM Elements
const micButton = document.getElementById('micButton');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const recognizedText = document.getElementById('recognizedText');
const remindersList = document.getElementById('remindersList');
const noReminders = document.getElementById('noReminders');
const helpButton = document.getElementById('helpButton');
const helpModal = document.getElementById('helpModal');
const closeModal = document.getElementById('closeModal');

// Speech Recognition Setup
const recognition = new SpeechRecognition();
recognition.lang = 'pt-BR';
recognition.continuous = false;
recognition.interimResults = false;

// Text-to-Speech Setup
const synth = window.speechSynthesis;

// Application State
let isListening = false;
const STORAGE_KEY = 'voice_reminders';
let hasNotifiedPermission = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    displayReminders();
    checkPermissions();
    scheduleNotificationsCheck();
    
    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.error('Service Worker registration failed:', err));
    }
});

// Event Listeners
micButton.addEventListener('click', toggleListening);
helpButton.addEventListener('click', showHelp);
closeModal.addEventListener('click', () => {
    helpModal.style.display = 'none';
});

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    if (event.target === helpModal) {
        helpModal.style.display = 'none';
    }
});

// Speech Recognition Events
recognition.onstart = () => {
    isListening = true;
    micButton.classList.add('mic-active');
    statusBar.classList.add('listening');
    statusText.textContent = 'Ouvindo...';
    recognizedText.textContent = '';
};

recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    recognizedText.textContent = transcript;
    processCommand(transcript);
};

recognition.onend = () => {
    isListening = false;
    micButton.classList.remove('mic-active');
    statusBar.classList.remove('listening');
    statusText.textContent = 'Toque no botão do microfone para falar';
};

recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isListening = false;
    micButton.classList.remove('mic-active');
    statusBar.classList.remove('listening');
    statusText.textContent = 'Erro no reconhecimento de voz. Tente novamente.';
    
    if (event.error === 'not-allowed' && !hasNotifiedPermission) {
        speak("Por favor, permita o acesso ao microfone para usar o reconhecimento de voz.");
        hasNotifiedPermission = true;
    }
};

// Core Functions
function toggleListening() {
    if (isListening) {
        recognition.stop();
    } else {
        try {
            recognition.start();
            speak("Estou ouvindo", true);
        } catch (error) {
            console.error("Recognition error:", error);
            statusText.textContent = 'Erro ao iniciar reconhecimento de voz. Tente novamente.';
        }
    }
}

function speak(text, quiet = false) {
    if (synth.speaking) {
        synth.cancel();
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.volume = quiet ? 0.5 : 1;
    utterance.rate = 1.1;
    synth.speak(utterance);
}

function processCommand(text) {
    text = text.toLowerCase().trim();
    
    if (text.includes('criar lembrete') || text.includes('novo lembrete') || text.includes('lembrar de')) {
        createReminderFromVoice(text);
    } else if (text.includes('mostrar lembretes') || text.includes('ver lembretes') || text.includes('listar lembretes')) {
        listReminders();
    } else if (text.includes('excluir todos') || text.includes('deletar todos')) {
        deleteAllReminders();
    } else if (text.includes('excluir lembrete') || text.includes('deletar lembrete')) {
        deleteLatestReminder();
    } else if (text.includes('ajuda') || text.includes('como usar')) {
        showHelp();
    } else {
        // If no specific command is detected, try to create a reminder with the entire text
        createReminderFromVoice("criar lembrete para " + text);
    }
}

function createReminderFromVoice(command) {
    let title = '';
    
    // Extract title
    if (command.includes('para')) {
        title = command.split('para')[1].trim();
    } else if (command.includes('de')) {
        title = command.split('de')[1].trim();
    } else if (command.includes('sobre')) {
        title = command.split('sobre')[1].trim();
    } else {
        title = command.replace('criar lembrete', '').replace('novo lembrete', '').replace('lembrar', '').trim();
    }
    
    // Clean up common endings
    ['amanhã', 'hoje', 'às', 'as', 'da manhã', 'da tarde', 'da noite'].forEach(word => {
        const index = title.lastIndexOf(' ' + word);
        if (index !== -1) {
            title = title.substring(0, index).trim();
        }
    });
    
    // Remove common connecting words at the end
    title = title.replace(/(\s(em|no|na|para|de|do|da)\s*)$/i, '').trim();
    
    if (!title) {
        speak("Não consegui entender o lembrete. Por favor, tente novamente.");
        return;
    }
    
    const dateTime = parseDateTime(command);
    const reminder = addReminder(title, dateTime);
    
    // Confirmation by voice
    const timeStr = `${dateTime.getHours().toString().padStart(2, '0')}:${dateTime.getMinutes().toString().padStart(2, '0')}`;
    speak(`Lembrete criado para ${timeStr} - ${title}`);
}

function parseDateTime(text) {
    const now = new Date();
    let dateTime = new Date();
    dateTime.setSeconds(0, 0); // Reset seconds and milliseconds
    
    // Default time is in one hour
    dateTime.setHours(dateTime.getHours() + 1);
    
    // Check for specific time
    const timeRegex = /às (\d{1,2})(?::(\d{1,2}))?\s*(horas?|da tarde|da noite|da manhã)?/i;
    const timeMatch = text.match(timeRegex);
    
    if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        
        // Handle afternoon/evening time expressions
        if (timeMatch[3] && (timeMatch[3].includes('tarde') || timeMatch[3].includes('noite')) && hours < 12) {
            hours += 12;
        }
        
        dateTime.setHours(hours, minutes);
        
        // If the time is in the past, set it to tomorrow
        if (dateTime < now) {
            dateTime.setDate(dateTime.getDate() + 1);
        }
    }
    
    // Check for specific dates
    if (text.includes('amanhã')) {
        dateTime.setDate(now.getDate() + 1);
    } else if (text.includes('depois de amanhã')) {
        dateTime.setDate(now.getDate() + 2);
    } else if (text.includes('próxima semana') || text.includes('proxima semana')) {
        dateTime.setDate(now.getDate() + 7);
    }
    
    // Check for days of the week
    const daysOfWeek = [
        { names: ['domingo', 'dom'], day: 0 },
        { names: ['segunda', 'segunda-feira', 'seg'], day: 1 },
        { names: ['terça', 'terça-feira', 'ter'], day: 2 },
        { names: ['quarta', 'quarta-feira', 'qua'], day: 3 },
        { names: ['quinta', 'quinta-feira', 'qui'], day: 4 },
        { names: ['sexta', 'sexta-feira', 'sex'], day: 5 },
        { names: ['sábado', 'sabado', 'sab'], day: 6 }
    ];
    
    for (const dayObj of daysOfWeek) {
        for (const dayName of dayObj.names) {
            if (text.includes(dayName)) {
                const targetDay = dayObj.day;
                const currentDay = now.getDay();
                let daysToAdd = targetDay - currentDay;
                
                // If the day has already passed this week, go to next week
                if (daysToAdd <= 0) {
                    daysToAdd += 7;
                }
                
                dateTime.setDate(now.getDate() + daysToAdd);
                break;
            }
        }
    }
    
    return dateTime;
}

// Reminder Management Functions
function getReminders() {
    const remindersJSON = localStorage.getItem(STORAGE_KEY);
    return remindersJSON ? JSON.parse(remindersJSON) : [];
}

function saveReminders(reminders) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
}

function addReminder(title, dateTime) {
    const reminders = getReminders();
    const newReminder = {
        id: Date.now().toString(),
        title: title,
        dateTime: dateTime.toISOString(),
        notified: false
    };
    
    reminders.push(newReminder);
    saveReminders(reminders);
    displayReminders();
    scheduleNotification(newReminder);
    
    return newReminder;
}

function deleteReminder(id) {
    let reminders = getReminders();
    reminders = reminders.filter(reminder => reminder.id !== id);
    saveReminders(reminders);
    displayReminders();
}

function deleteAllReminders() {
    saveReminders([]);
    displayReminders();
    speak("Todos os lembretes foram excluídos");
}

function deleteLatestReminder() {
    const reminders = getReminders();
    
    if (reminders.length === 0) {
        speak("Você não tem lembretes para excluir.");
        return;
    }
    
    // Sort reminders by date (ascending)
    reminders.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    
    // Delete the earliest reminder
    const reminderToDelete = reminders[0];
    deleteReminder(reminderToDelete.id);
    
    speak("Lembrete excluído.");
}

function displayReminders() {
    const reminders = getReminders();
    
    // Sort reminders by date (ascending)
    reminders.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    
    if (reminders.length === 0) {
        remindersList.innerHTML = '';
        noReminders.style.display = 'block';
        return;
    }
    
    noReminders.style.display = 'none';
    
    let html = '';
    reminders.forEach(reminder => {
        const date = new Date(reminder.dateTime);
        const formattedDate = formatDate(date);
        const isPast = date < new Date();
        const statusClass = isPast ? 'status-past' : '';
        
        html += `
            <li class="reminder-item ${statusClass}" data-id="${reminder.id}">
                <div class="reminder-title">${reminder.title}</div>
                <div class="reminder-date">${formattedDate}</div>
                <button class="delete-btn" aria-label="Excluir lembrete" 
                        onclick="deleteReminderById('${reminder.id}')">×</button>
            </li>
        `;
    });
    
    remindersList.innerHTML = html;
}

function formatDate(date) {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    
    // Format: 01/01/2023 às 14:30
    const fullFormat = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} às ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    // Check if it's today or tomorrow
    if (date.toDateString() === today.toDateString()) {
        return `Hoje às ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
        return `Amanhã às ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else {
        return fullFormat;
    }
}

// Notification Functions
function scheduleNotification(reminder) {
    const reminderTime = new Date(reminder.dateTime);
    if (reminderTime <= new Date()) return;
    
    // Check if browser supports notifications
    if (!("Notification" in window)) {
        console.log("This browser does not support notifications");
        return;
    }
    
    // If permission already granted, schedule the notification
    if (Notification.permission === "granted") {
        scheduleNotificationTimer(reminder);
    }
    // Request permission if not asked yet
    else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                scheduleNotificationTimer(reminder);
            }
        });
    }
}

function scheduleNotificationTimer(reminder) {
    const reminderTime = new Date(reminder.dateTime);
    const now = new Date();
    const timeUntilReminder = reminderTime.getTime() - now.getTime();
    
    if (timeUntilReminder <= 0) return;
    
    // Store the timeout ID with the reminder ID
    window[`notification_${reminder.id}`] = setTimeout(() => {
        showNotification(reminder);
        markReminderAsNotified(reminder.id);
    }, timeUntilReminder);
}

function showNotification(reminder) {
    if (Notification.permission === "granted") {
        const notification = new Notification("Lembrete", {
            body: reminder.title,
            icon: "favicon.ico",
            vibrate: [200, 100, 200]
        });
        
        notification.onclick = function() {
            window.focus();
            this.close();
        };
        
        // Also use speech to notify
        speak(`Lembrete: ${reminder.title}`);
    }
}

function markReminderAsNotified(id) {
    const reminders = getReminders();
    const updatedReminders = reminders.map(reminder => {
        if (reminder.id === id) {
            return { ...reminder, notified: true };
        }
        return reminder;
    });
    
    saveReminders(updatedReminders);
    displayReminders();
}

function scheduleNotificationsCheck() {
    // Check for due reminders every minute
    setInterval(() => {
        const reminders = getReminders();
        const now = new Date();
        
        reminders.forEach(reminder => {
            const reminderTime = new Date(reminder.dateTime);
            // If reminder is due and hasn't been notified yet
            if (reminderTime <= now && !reminder.notified) {
                showNotification(reminder);
                markReminderAsNotified(reminder.id);
            }
        });
    }, 60000); // Check every minute
}

function checkPermissions() {
    // Check notification permission
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function listReminders() {
    const reminders = getReminders();
    
    if (reminders.length === 0) {
        speak("Você não tem lembretes.");
        return;
    }
    
    speak(`Você tem ${reminders.length} lembretes.`);
}

function showHelp() {
    helpModal.style.display = 'flex';
}

// Global function accessible from HTML
window.deleteReminderById = function(id) {
    deleteReminder(id);
    
    // Also clear any scheduled notification
    if (window[`notification_${id}`]) {
        clearTimeout(window[`notification_${id}`]);
        delete window[`notification_${id}`];
    }
};

// Add PWA install functionality
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67+ from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
});