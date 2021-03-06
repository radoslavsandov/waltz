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
import {mkTweakers} from "../source-and-target-graph/source-and-target-utilities";

import template from "./logical-flow-edit-panel.html";
import {displayError} from "../../../common/error-utils";
import {sameRef} from "../../../common/entity-utils";


const bindings = {
    parentEntityRef: "<",
};


const initialState = {
    allActors: [],
    app: null,
    appsById: {},
    dataTypeUsages: [],
    flows: [],
    isDirty: false,
    mode: "", // editCounterpart | editDataTypeUsage
    physicalFlows: [],
    selectedCounterpart: null,
    selectedDecorators: null,
    selectedFlow: null,
    selectedUsages: []
};


function mkNewFlow(source, target) {
    return {
        source,
        target
    };
}


function mkAddFlowCommand(flow) {
    return {
        source: flow.source,
        target: flow.target
    };
}


function notifyIllegalFlow(notification, primaryApp, counterpartRef) {
    if (primaryApp.id === counterpartRef.id && counterpartRef.kind === "APPLICATION") {
        notification.warning("An application may not link to itself.");
        return true;
    }
    return false;
}


function vetoMove(isDirty) {
    if (isDirty) {
        alert("Unsaved changes, either apply them or cancel");
        return true;
    }
    return false;
}


function controller($q,
                    $scope,
                    notification,
                    serviceBroker) {
    const vm = initialiseData(this, initialState);

    vm.$onChanges = (changes) => {
        if(vm.parentEntityRef) {
            reload()
                .then(() => {
                    const baseTweakers = {
                        source: {onSelect: a => $scope.$applyAsync(() => selectSource(a))},
                        target: {onSelect: a => $scope.$applyAsync(() => selectTarget(a))},
                        type: {onSelect: a => $scope.$applyAsync(() => selectType(a))}
                    };

                    vm.flowTweakers = mkTweakers(
                        baseTweakers,
                        vm.physicalFlows,
                        vm.logicalFlows);
                });

            serviceBroker
                .loadViewData(
                    CORE_API.ActorStore.findAll,
                    [])
                .then(r => vm.allActors = r.data);
        }
    };

    const addFlow = (flow) => {
        const alreadyRegistered = _.some(
            vm.logicalFlows,
            f => f.source.id === flow.source.id && f.target.id === flow.target.id);

        if (! alreadyRegistered) {
            return serviceBroker
                .execute(
                    CORE_API.LogicalFlowStore.addFlow,
                    [mkAddFlowCommand(flow)])
                .then(savedFlow => vm.logicalFlows.push(savedFlow))
                .then(reload);
        } else {
            return Promise.resolve();
        }
    };


    function loadLogicalFlows() {
        return serviceBroker
            .loadViewData(
                CORE_API.LogicalFlowStore.findByEntityReference,
                [vm.parentEntityRef],
                {force: true})
            .then(r => vm.logicalFlows = r.data);
    }


    function loadPhysicalFlows() {
        return serviceBroker
            .loadViewData(
                CORE_API.PhysicalFlowStore.findByEntityReference,
                [ vm.parentEntityRef ],
                { force: true })
            .then(r => vm.physicalFlows = r.data);
    }


    function loadLogicalFlowDecorators() {
        return serviceBroker
            .loadViewData(
                CORE_API.LogicalFlowDecoratorStore.findBySelectorAndKind,
                [ { entityReference: vm.parentEntityRef, scope: "EXACT" }, "DATA_TYPE" ],
                { force: true })
            .then(r => vm.logicalFlowDecorators = r.data);
    }


    function loadDataTypeUsages() {
        return serviceBroker
            .loadViewData(
                CORE_API.DataTypeUsageStore.findForEntity,
                [ vm.parentEntityRef ],
                { force: true })
            .then(r => vm.dataTypeUsages = r.data);
    }


    const reload = () => {
        vm.cancel();
        return $q.all([
            loadLogicalFlows(),
            loadLogicalFlowDecorators(),
            loadDataTypeUsages(),
            loadPhysicalFlows()
        ]);
    };

    const selectSource = (selection) => {
        const flowMatchingCriteria = {
            source: { id: selection.id, kind: selection.kind },
            target: vm.parentEntityRef
        };
        selectCounterpart(selection, flowMatchingCriteria);
    };

    const selectTarget = (selection) => {
        const flowMatchingCriteria = {
            source: vm.parentEntityRef,
            target: { id: selection.id, kind: selection.kind }
        };
        selectCounterpart(selection, flowMatchingCriteria);
    };

    const selectCounterpart = (selection, matchCriteria) => {
        if (vetoMove(vm.isDirty)) { return; }
        vm.setMode("editCounterpart");
        vm.selectedCounterpart = selection;
        vm.selectedFlow = _.find(vm.logicalFlows, f =>
            sameRef(f.source, matchCriteria.source) &&
            sameRef(f.target, matchCriteria.target));
        vm.selectedDecorators = vm.selectedFlow
            ? _.filter(vm.logicalFlowDecorators, { dataFlowId: vm.selectedFlow.id })
            : [];
    };

    const selectType = (type) => {
        vm.setMode("editDataTypeUsage");
        vm.selectedDataType = type;
        vm.selectedUsages = _.chain(vm.dataTypeUsages)
            .filter({ dataTypeId: type.id })
            .map("usage")
            .value();
    };

    const updateDecorators = (command) => {
        return serviceBroker
            .execute(
                CORE_API.LogicalFlowDecoratorStore.updateDecorators,
                [command])
            .then(reload)
            .then(() => notification.success("Data flow updated"));
    };



    // INTERACTIVE FUNCTIONS

    vm.onReload = () => {
        reload();
    };

    vm.cancel = () => {
        vm.selectedCounterpart = null;
        vm.selectedDecorators = null;
        vm.selectedFlow = null;
        vm.isDirty = false;
        vm.setMode("");
    };

    vm.updateFlow = (command) => {
        if (! command.flowId) {
            return serviceBroker
                .execute(
                    CORE_API.LogicalFlowStore.addFlow,
                    [mkAddFlowCommand(vm.selectedFlow)])
                .then(flow => Object.assign(command, { flowId: flow.id }))
                .then(updateDecorators);

        } else {
            return updateDecorators(command);
        }
    };

    vm.deleteFlow = (flow) => {
        const hasPhysicalFlow = _.some(vm.physicalFlows, { logicalFlowId: flow.id });
        if (!hasPhysicalFlow) {
            serviceBroker
                .execute(
                    CORE_API.LogicalFlowStore.removeFlow,
                    [flow.id])
                .then(reload)
                .then(() => notification.warning("Data flow removed"))
                .catch(e => displayError(notification, "System error, please contact support", e));
        } else {
            notification.warning("This data flow has associated physical flows, please check and remove those first")
        }
    };

    vm.saveUsages = (usages = []) => {
        const dataTypeId = vm.selectedDataType.id;
        serviceBroker
            .execute(
                CORE_API.DataTypeUsageStore.save,
                [vm.parentEntityRef, dataTypeId, usages])
            .then(() => reload())
            .then(() => notification.success("Data usage updated"));
    };

    const addSource = (kind, entity) => {
        const counterpartRef = { id: entity.id, kind, name: entity.name };
        if (notifyIllegalFlow(notification, vm.parentEntityRef, counterpartRef)) return;
        addFlow(mkNewFlow(counterpartRef, vm.parentEntityRef))
            .then(() => selectSource(counterpartRef));
    };

    const addTarget = (kind, entity) => {
        const counterpartRef = { id: entity.id, kind, name: entity.name };
        if (notifyIllegalFlow(notification, vm.parentEntityRef, counterpartRef)) return;
        addFlow(mkNewFlow(vm.parentEntityRef, counterpartRef))
            .then(() => selectTarget(counterpartRef));
    };

    vm.addSourceApplication = (srcApp) => {
        addSource("APPLICATION", srcApp);
    };

    vm.addSourceActor = (actor) => {
        addSource("ACTOR", actor);
    };

    vm.addTargetApplication = (targetApp) => {
        addTarget("APPLICATION", targetApp);
    };

    vm.addTargetActor = (actor) => {
        addTarget("ACTOR", actor);
    };

    vm.setDirtyChange = (dirty) => {
        vm.isDirty = dirty;
    };

    vm.setMode = (mode) => {
        if (vetoMove(vm.isDirty)) {
            return;
        }
        vm.mode = mode;
    };
}


controller.$inject = [
    "$q",
    "$scope",
    "Notification",
    "ServiceBroker"
];


const component = {
    template,
    bindings,
    controller
};


export default {
    component,
    id: "waltzLogicalFlowEditPanel"
};
