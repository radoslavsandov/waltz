/*
 * Waltz - Enterprise Architecture
 * Copyright (C) 2016, 2017, 2018, 2019 Waltz open source project
 * See README.md for more information
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific
 *
 */
import template from './asset-code-explorer.html';


function controller(appStore) {

    const vm = this;
    vm.status = 'CLOSED';

    vm.loadRelated = () => {
        vm.status = 'LOADING';
        appStore.findRelatedById(vm.application.id).then(related => {
            vm.related = related;
            vm.status = 'LOADED';
        });
    };
}

controller.$inject = ['ApplicationStore'];

export default () => {
    return {
        restrict: 'E',
        replace: true,
        template,
        scope: {},
        controller,
        controllerAs: 'ctrl',
        bindToController: {
            application: '='
        }
    };
};
