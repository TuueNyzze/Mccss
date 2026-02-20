{{- define "mccss-demo.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mccss-demo.fullname" -}}
{{- printf "%s" (include "mccss-demo.name" .) -}}
{{- end -}}
