#!/usr/bin/env bash
# Run one command as a Fargate one-shot of a service's task definition, with the
# service's own network configuration, print its log, and fail unless the
# container exited 0.
#
# usage: run-ecs-one-shot.sh <cluster> <service> <task-definition-arn> <command-json-array>

set -euo pipefail

if (($# != 4)); then
  echo "usage: $0 <cluster> <service> <task-definition-arn> <command-json-array>" >&2
  exit 2
fi

cluster="$1"
service="$2"
task_definition="$3"
command_json="$4"

# Read back from the running service, so subnets, security groups and
# assignPublicIp are defined in one place (oxy-infra) and cannot drift here.
service_json="$(aws ecs describe-services --cluster "$cluster" --services "$service" \
  --query 'services[0]' --output json)"
network="$(jq -c '.networkConfiguration' <<<"$service_json")"
# The one-shot runs where the service runs: on its capacity provider strategy
# when it has one (oxy-cluster's EC2 capacity, whose revisions are EC2-only),
# otherwise on its launch type. A hard-coded FARGATE would refuse an EC2-only
# revision and fail the deploy before the rollout.
strategy="$(jq -c '.capacityProviderStrategy // []' <<<"$service_json")"
if [[ "$strategy" != "[]" ]]; then
  placement=(--capacity-provider-strategy "$strategy")
else
  placement=(--launch-type "$(jq -r '.launchType // "FARGATE"' <<<"$service_json")")
fi

overrides="$(jq -nc --arg name "$service" --argjson command "$command_json" \
  '{containerOverrides: [{name: $name, command: $command}]}')"

run_json="$(aws ecs run-task \
  --cluster "$cluster" \
  --task-definition "$task_definition" \
  "${placement[@]}" \
  --network-configuration "$network" \
  --started-by "deploy-$service" \
  --overrides "$overrides")"
task_arn="$(jq -r '.tasks[0].taskArn // empty' <<<"$run_json")"
if [[ -z "$task_arn" ]]; then
  echo "::error::ECS did not start the one-shot task: $(jq -c '.failures' <<<"$run_json")"
  exit 1
fi

echo "one-shot task: $task_arn"
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"

log_options="$(aws ecs describe-task-definition --task-definition "$task_definition" \
  --query "taskDefinition.containerDefinitions[?name=='$service'].logConfiguration.options | [0]" \
  --output json)"
log_group="$(jq -r '."awslogs-group" // empty' <<<"$log_options")"
log_prefix="$(jq -r '."awslogs-stream-prefix" // empty' <<<"$log_options")"
if [[ -n "$log_group" && -n "$log_prefix" ]]; then
  echo "--- $log_prefix/$service/${task_arn##*/}"
  aws logs get-log-events \
    --log-group-name "$log_group" \
    --log-stream-name "$log_prefix/$service/${task_arn##*/}" \
    --start-from-head \
    --query 'events[].message' \
    --output text || echo "(no log events retrieved)"
fi

exit_code="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
  --query "tasks[0].containers[?name=='$service'].exitCode | [0]" --output text)"
if [[ "$exit_code" != "0" ]]; then
  reason="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" \
    --query 'tasks[0].stoppedReason' --output text)"
  echo "::error::one-shot exited $exit_code ($reason)"
  exit 1
fi
echo "one-shot succeeded"
