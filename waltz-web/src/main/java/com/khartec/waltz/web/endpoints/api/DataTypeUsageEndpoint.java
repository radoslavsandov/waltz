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

package com.khartec.waltz.web.endpoints.api;

import com.khartec.waltz.common.CollectionUtilities;
import com.khartec.waltz.model.*;
import com.khartec.waltz.model.changelog.ChangeLog;
import com.khartec.waltz.model.changelog.ImmutableChangeLog;
import com.khartec.waltz.model.data_type_usage.DataTypeUsage;
import com.khartec.waltz.model.system.SystemChangeSet;
import com.khartec.waltz.model.tally.Tally;
import com.khartec.waltz.model.usage_info.UsageInfo;
import com.khartec.waltz.model.usage_info.UsageKind;
import com.khartec.waltz.model.user.SystemRole;
import com.khartec.waltz.service.changelog.ChangeLogService;
import com.khartec.waltz.service.usage_info.DataTypeUsageService;
import com.khartec.waltz.service.user.UserRoleService;
import com.khartec.waltz.web.ListRoute;
import com.khartec.waltz.web.WebUtilities;
import com.khartec.waltz.web.endpoints.Endpoint;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import spark.Request;
import spark.Response;

import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import static com.khartec.waltz.common.Checks.checkNotNull;
import static com.khartec.waltz.common.CollectionUtilities.maybe;
import static com.khartec.waltz.common.ListUtilities.newArrayList;
import static com.khartec.waltz.web.WebUtilities.*;
import static com.khartec.waltz.web.endpoints.EndpointUtilities.*;

@Service
public class DataTypeUsageEndpoint implements Endpoint {


    private static final String BASE_URL = mkPath("api", "data-type-usage");

    private final DataTypeUsageService dataTypeUsageService;
    private final UserRoleService userRoleService;
    private final ChangeLogService changeLogService;

    @Autowired
    public DataTypeUsageEndpoint(DataTypeUsageService dataTypeUsageService,
                                 UserRoleService userRoleService,
                                 ChangeLogService changeLogService) {
        checkNotNull(dataTypeUsageService, "dataTypeUsageService cannot be null");
        checkNotNull(userRoleService, "userRoleService cannot be null");
        checkNotNull(changeLogService, "changeLogService cannot be null");

        this.dataTypeUsageService = dataTypeUsageService;
        this.userRoleService = userRoleService;
        this.changeLogService = changeLogService;
    }

    @Override
    public void register() {

        String findForEntityPath = mkPath(BASE_URL, "entity", ":kind", ":id");
        String findForDataTypeSelectorPath = mkPath(BASE_URL, "type");
        String findUsageStatsForDataTypeSelectorPath = mkPath(BASE_URL, "type", "stats");
        String findForUsageKindByDataTypeSelectorPath = mkPath(BASE_URL, "usage-kind", ":usage-kind");
        String calculateForAllApplicationsPath = mkPath(BASE_URL, "calculate-all", "application");
        String findForSelectorPath = mkPath(BASE_URL, "selector");
        String savePath = mkPath(BASE_URL, "entity", ":kind", ":id", ":typeId");

        ListRoute<DataTypeUsage> findForEntityRoute = (request, response)
                -> dataTypeUsageService.findForEntity(getEntityReference(request));

        ListRoute<DataTypeUsage> findForDataTypeSelectorRoute = (request, response)
                -> dataTypeUsageService.findForDataTypeSelector(readIdSelectionOptionsFromBody(request));

        ListRoute<Tally<String>> findUsageStatsForDataTypeSelectorRoute = (request, response)
                -> dataTypeUsageService.findUsageStatsForDataTypeSelector(readIdSelectionOptionsFromBody(request));

        ListRoute<DataTypeUsage> findForSelectorRoute = (request, response)
                -> dataTypeUsageService.findForAppIdSelector(EntityKind.APPLICATION, readIdSelectionOptionsFromBody(request));

        getForList(findForEntityPath, findForEntityRoute);
        postForList(findForDataTypeSelectorPath, findForDataTypeSelectorRoute);
        postForList(findUsageStatsForDataTypeSelectorPath, findUsageStatsForDataTypeSelectorRoute);
        postForList(findForSelectorPath, findForSelectorRoute);
        postForList(savePath, this::saveRoute);
        getForDatum(calculateForAllApplicationsPath, this::calculateForAllApplicationsRoute);
        postForDatum(findForUsageKindByDataTypeSelectorPath, this::findForUsageKindByDataTypeSelectorRoute);
    }


    private Map<Long, Collection<EntityReference>> findForUsageKindByDataTypeSelectorRoute(Request request,
                                                                                           Response response) throws IOException
    {
        IdSelectionOptions options = readIdSelectionOptionsFromBody(request);
        UsageKind usageKind = readEnum(request,
                "usage-kind",
                UsageKind.class,
                s -> UsageKind.ORIGINATOR);
        return dataTypeUsageService.findForUsageKindByDataTypeIdSelector(usageKind, options);
    }


    private Boolean calculateForAllApplicationsRoute(Request request,
                                                     Response response) {
        requireRole(userRoleService, request, SystemRole.ADMIN);
        return dataTypeUsageService.recalculateForAllApplications();
    }


    private List<DataTypeUsage> saveRoute(Request request,
                                          Response response) throws IOException {
        requireRole(userRoleService, request, SystemRole.LOGICAL_DATA_FLOW_EDITOR);

        String user = getUsername(request);
        EntityReference ref = getEntityReference(request);
        Long dataTypeId = WebUtilities.getLong(request,"typeId");
        UsageInfo[] usages = readBody(request, UsageInfo[].class);

        SystemChangeSet<UsageInfo, UsageKind> changes = dataTypeUsageService.save(ref, dataTypeId, newArrayList(usages));

        logChanges(user, ref, dataTypeId, changes);

        return dataTypeUsageService.findForEntityAndDataType(ref, dataTypeId);
    }


    private void logChanges(String user,
                            EntityReference ref,
                            Long dataTypeId,
                            SystemChangeSet<UsageInfo, UsageKind> changes) {
        maybe(changes.deletes(), deletes -> logDeletes(user, ref, dataTypeId, deletes));
        maybe(changes.updates(), updates -> logUpdates(user, ref, dataTypeId, updates));
        maybe(changes.inserts(), inserts -> logInserts(user, ref, dataTypeId, inserts));
    }


    private void logDeletes(String user,
                            EntityReference ref,
                            Long dataTypeId,
                            Collection<UsageKind> deletes) {
        String message = "Removed usage kind/s: " + deletes + " for data type id: " + dataTypeId;
        logChange(user, ref, message);
    }


    private void logInserts(String user,
                            EntityReference ref,
                            Long dataTypeId,
                            Collection<UsageInfo> inserts) {
        Collection<UsageKind> kinds = CollectionUtilities.map(inserts, UsageInfo::kind);
        String message = "Added usage kind/s: " + kinds + " for data type: " + dataTypeId;
        logChange(user, ref, message);
    }


    private void logUpdates(String user,
                            EntityReference ref,
                            Long dataTypeId,
                            Collection<UsageInfo> updates) {
        Collection<UsageKind> kinds = CollectionUtilities.map(updates, UsageInfo::kind);
        String message = "Updated usage kind/s: " + kinds + " for data type: " + dataTypeId;
        logChange(user, ref, message);
    }


    private void logChange(String userId,
                           EntityReference ref,
                           String message) {
        ChangeLog logEntry = ImmutableChangeLog.builder()
                .parentReference(ref)
                .message(message)
                .severity(Severity.INFORMATION)
                .userId(userId)
                .childKind(EntityKind.LOGICAL_DATA_FLOW)
                .operation(Operation.UPDATE)
                .build();

        changeLogService.write(logEntry);
    }
}
