(function () {
    'use strict';

    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            var catalog = {
                title: 'Собрано заново',
                url: '',
                name: 'viewed_reconstruct',
                on_back: function() {
                    Lampa.Controller.toggle('main');
                }
            };

            // Добавляем пункт в боковое меню
            var menu_item = $('<div class="menu__item selector" data-type="viewed_reconstruct">' +
                '<div class="menu__item-icon">' +
                '<svg height="36" viewBox="0 0 24 24" width="36" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="white"/></svg>' +
                '</div>' +
                '<div class="menu__item-title">Восстановлено</div>' +
                '</div>');

            menu_item.on('hover:enter', function () {
                var items = [];
                // Проходим по локальному хранилищу Lampa
                var storage = Lampa.Storage.cache('films'); // Пытаемся достать кэшированные данные
                
                // Фильтруем всё, где есть пометка о просмотре
                Object.keys(localStorage).forEach(function(key) {
                    if (key.indexOf('viewed_') >= 0) {
                        var data = Lampa.Storage.get(key);
                        if (data) items.push(data);
                    }
                });

                if (items.length > 0) {
                    Lampa.Activity.push({
                        url: '',
                        title: 'Просмотренные (найдено: ' + items.length + ')',
                        component: 'category_full',
                        items: items,
                        page: 1
                    });
                } else {
                    Lampa.Noty.show('Ничего не найдено в памяти устройства');
                }
            });

            $('.menu .menu__list').append(menu_item);
        }
    });
})();