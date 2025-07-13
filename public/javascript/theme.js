document.addEventListener('DOMContentLoaded', function() {
    const themeSwitcher = document.getElementById('theme-switcher');
    const htmlElement = document.documentElement;
    
    // Initialize theme from localStorage or server-set value
    const initializeTheme = () => {
        // Check for server-set theme first (from EJS)
        const serverTheme = htmlElement.getAttribute('data-theme');
        
        // Fallback to localStorage then system preference
        const savedTheme = serverTheme || 
                          localStorage.getItem('theme') || 
                          (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        
        htmlElement.setAttribute('data-theme', savedTheme);
    };

    initializeTheme();
    
    // Toggle theme
    themeSwitcher.addEventListener('click', function() {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        // Save to server
        fetch('/preferences/theme', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ theme: newTheme })
        }).catch(err => console.error('Error saving theme:', err));
    });
    
    // Watch for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('theme')) { // Only if no explicit preference set
            htmlElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
    });
});