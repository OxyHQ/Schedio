#!/usr/bin/env bash
# Register a revision of a task definition with ONE container's image replaced,
# and print its ARN. Environment and secrets are owned by oxy-infra and carried
# forward from the source revision unchanged.
#
# usage: register-task-revision.sh <source-task-definition> <container> <image>
#
# DRY_RUN=1 prints the rendered definition instead of registering it.

set -euo pipefail

if (($# != 3)); then
  echo "usage: $0 <source-task-definition> <container> <image>" >&2
  exit 2
fi

source_task_definition="$1"
container="$2"
image="$3"

source_file="$(mktemp)"
rendered_file="$(mktemp)"
trap 'rm -f "$source_file" "$rendered_file"' EXIT

aws ecs describe-task-definition --task-definition "$source_task_definition" \
  --query taskDefinition --output json >"$source_file"

matches="$(jq --arg name "$container" '[.containerDefinitions[] | select(.name == $name)] | length' "$source_file")"
if [[ "$matches" != "1" ]]; then
  echo "::error::$source_task_definition has $matches containers named $container; expected exactly one" >&2
  exit 1
fi

jq --arg name "$container" --arg image "$image" '
    .containerDefinitions |= map(if .name == $name then .image = $image else . end)
    | del(
        .taskDefinitionArn,
        .revision,
        .status,
        .requiresAttributes,
        .compatibilities,
        .registeredAt,
        .registeredBy,
        .deregisteredAt
      )
  ' "$source_file" >"$rendered_file"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  cat "$rendered_file"
  exit 0
fi

aws ecs register-task-definition \
  --cli-input-json "file://$rendered_file" \
  --query 'taskDefinition.taskDefinitionArn' --output text
