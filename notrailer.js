(function () {  
    'use strict';	  
    Lampa.Listener.follow('full', function (e) {  
        if (e.type == 'complite') {  
            // Проверяем, что activity существует  
            if (!e.object || !e.object.activity) {  
                return;  
            }  
              
            // Сразу скрываем трейлеры  
            e.object.activity.render().find('.view--trailer').remove();  
              
            // Сохраняем ссылку на activity  
            const activity = e.object.activity;  
              
            // Создаем наблюдатель для кнопки Shots  
            const observer = new MutationObserver(function(mutations) {  
                // Проверяем, что activity все еще существует  
                if (activity && activity.render) {  
                    try {  
                        const shotsButton = activity.render().find('.shots-view-button');  
                        if (shotsButton.length > 0) {  
                            shotsButton.remove();  
                        }  
                    } catch (error) {  
                        // Если ошибка, останавливаем наблюдатель  
                        observer.disconnect();  
                    }  
                }  
            });  
              
            // Начинаем наблюдение за изменениями в activity  
            try {  
                observer.observe(activity.render()[0], {  
                    childList: true,  
                    subtree: true  
                });  
            } catch (error) {  
                console.log('Не удалось начать наблюдение:', error);  
            }  
              
            // Также пробуем найти сразу  
            try {  
                activity.render().find('.shots-view-button').remove();  
            } catch (error) {  
                console.log('Не удалось удалить кнопку Shots:', error);  
            }  
        }  
    });  
})();