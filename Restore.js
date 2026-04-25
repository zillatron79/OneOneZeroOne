(function () {
    'use strict';

    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            var menu_item = $('<div class="menu__item selector" data-type="viewed_reconstruct">' +
                '<div class="menu__item-icon">' +
                '<svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none"/><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="white"/></svg>' +
                '</div>' +
                '<div class="menu__item-title">Восстановлено</div>' +
                '</div>');

            menu_item.on('hover:enter', function () {
                // 1. Пытаемся достать список просмотренных через встроенный кэш таймлайна
                var viewed_data = Lampa.Storage.get('viewed', '[]'); 
                var items = [];

                try {
                    if (typeof viewed_data === 'string') viewed_data = JSON.parse(viewed_data);
                    
                    // Lampa хранит просмотренное в массиве объектов, где есть card или movie
                    viewed_data.forEach(function(element) {
                        if (element.card) {
                            items.push(element.card);
                        } else if (element.title) {
                            items.push(element);
                        }
                    });
                } catch (e) {
                    console.log('Restore Error:', e);
                }

                // 2. Если массив пуст, пробуем "тяжелый" метод — поиск по меткам в памяти
                if (items.length === 0) {
                    for (var i = 0; i < localStorage.length; i++) {
                        var key = localStorage.key(i);
                        if (key.indexOf('viewed_item_') >= 0) {
                            var saved = Lampa.Storage.get(key);
                            if (saved) items.push(saved);
                        }
                    }
                }

                if (items.length > 0) {
                    // Удаляем дубликаты по ID
                    var unique_items = items.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);

                    Lampa.Activity.push({
                        url: '',
                        title: 'Найдено просмотренных',
                        component: 'category_full',
                        items: unique_items,
                        page: 1
                    });
                } else {
                    Lampa.Noty.show('Данные о просмотре не найдены в памяти');
                }
            });

            $('.menu .menu__list').append(menu_item);
        }
    });
})();
