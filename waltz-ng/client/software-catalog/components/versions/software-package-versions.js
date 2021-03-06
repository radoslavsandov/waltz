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

import _ from "lodash";
import {CORE_API} from "../../../common/services/core-api-utils";
import {initialiseData} from "../../../common";

import template from "./software-package-versions.html";


const bindings = {
    parentEntityRef: "<"
};


const initialState = {
    softwareCatalog: null,
    softwarePackage: null
};


function mkColumnDefs() {
    return [
        {
            field: "version",
            name: "Version",
        },
        {
            field: "externalId",
            name: "External Id",
        },
        {
            field: "description",
            name: "Description",
        },
        {
            field: "releaseDate",
            cellTemplate: `
                <waltz-from-now class="text-muted"
                                timestamp="row.entity.releaseDate"
                                days-only="true">
                </waltz-from-now>`
        },
        {
            field: "usageCount",
            name: "# Applications"
        }
    ];
}


function mkGridData(softwarePackage = {}, versions = [], usages = []) {
    const usagesByVersionId = _.groupBy(usages, "softwareVersionId");

    const gridData = _.map(versions, v => Object.assign(
        {},
        v,
        {usageCount: _.get(usagesByVersionId, `[${v.id}].length`, 0)}));

    return gridData;
}



function controller(serviceBroker) {
    const vm = initialiseData(this, initialState);

    const loadPackage = () => {
        return serviceBroker
            .loadViewData(
                CORE_API.SoftwareCatalogStore.getByPackageId,
                [vm.parentEntityRef.id])
            .then(r => {
                vm.softwareCatalog = r.data;
                vm.softwarePackage = _.get(vm.softwareCatalog, "packages[0]");

                vm.columnDefs = mkColumnDefs();
                vm.gridData = mkGridData(vm.softwarePackage,
                    vm.softwareCatalog.versions,
                    vm.softwareCatalog.usages);
            });
    };


    vm.$onInit = () => {
        loadPackage();
    };
}


controller.$inject = [
    "ServiceBroker"
];


const component = {
    template,
    bindings,
    controller
};


export default {
    component,
    id: "waltzSoftwarePackageVersions"
};
