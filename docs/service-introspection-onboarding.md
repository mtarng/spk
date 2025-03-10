# Service Introspection: Getting Started

Service Introspection shows information about a
[Bedrock GitOps workflow](https://github.com/microsoft/bedrock/tree/master/gitops).

Service introspection is used via the `spk deployment` commands. More
information about the commands is available in the command reference
[here](https://github.com/CatalystCode/spk/blob/master/docs/service-introspection.md).

The following diagram shows the main components of service introspection.
![spk service introspection diagram](./images/service_introspection.png)

To use service introspection you first need to make sure you have the following
pre-requisites.

## Components

1. GitOps pipelines workflow in Bedrock. To setup the workflow, follow
   [these](https://github.com/microsoft/bedrock/tree/master/gitops)
   instructions.
2. [Service introspection storage in Azure](#service-introspection-storage). See
   below for instructions on how to create one.
3. [Pipelines configuration](#pipelines-configuration)

### Service introspection storage

Service introspection tool needs a database to store the information about your
pipelines, builds and deployments. Currently, service introspection supports
storage in the form of an Azure Storage table. Follow the steps below to create
it or use an existing one.

#### 1.Create an Azure storage account:

**Option 1:**

Use the
[`spk deployment onboard`](https://github.com/CatalystCode/spk/blob/master/docs/service-introspection.md#onboard)
command.

**Option 2:**

Create the account manually or use an existing storage account. You will need to
have the following properties of this storage before proceeding as they are
required to configure:

- Name of the storage account
- Access key to this storage account
- Table name (this is the table that will store Spektate introspection details)

Once you have a storage account with a table, you may proceed to start updating
the pipelines to send data to Spektate storage.

**Note:** The Azure storage account is needed to store information about your
pipelines and services that is displayed by service introspection.

#### 2. Create a table. Follow these

[instructions](https://docs.microsoft.com/en-us/azure/storage/tables/table-storage-quickstart-portal).

#### 3. Storage account CORS settings

Configure the CORS settings for the storage account to allow requests from the
service introspection dasbhoard.

1. Go to the [Azure portal](https://portal.azure.com)
2. Search for the name of your storage account
3. Click the CORS options on the menu on the left side:

![cors menu option](./images/cors-menu.png)

Add the following settings under **Table Service**:
![cors settings](./images/cors-settings.png)

**Note:** If you are running the service introspection spk dashboard in a port
other than `4040`, add that entry in the settings instead.

### Pipelines Configuration

The Bedrock GitOps pipelines need to be configured to start sending data to
`spk` service introspection. This is done by adding a script snippet in each
`azure-pipelines.yml` configuration.

#### 1. Configure a variable group

To send data from Azure pipelines to the service introspection storage created
previously a variable group needs to be configured in Azure DevOps (where the
pipelines are).

To configure the variable group run:

```
spk variable-group create
```

You will need the following variables:

- `ACCOUNT_KEY`: Set this to the access key for your storage account
- `ACCOUNT_NAME`: Set this to the name of your storage account
- `PARTITION_KEY`: This field can be a distinguishing key that recognizea your
  source repository in the storage, for eg. in this example, we're using the
  name of the source repository `hello-bedrock`
- `TABLE_NAME`: Set this to the name of the table in your storage account that
  you prefer to use

![](./images/variable_group.png)

Make sure that you update the pipelines in the following steps to include this
variable group, such as below:

```yaml
variables:
  - group: <your-variable-group-name>
```

#### 2. CI pipeline configuration

The CI pipeline runs from the source repository to build a docker image.

Paste the following task in its corresponding `azure-pipelines.yml`:

```yaml
- bash: |
    tag_name="hello-spektate-$(Build.SourceBranchName)-$(Build.BuildId)"
    commitId=$(Build.SourceVersion)
    commitId=$(echo "${commitId:0:7}")
    service=$(Build.Repository.Name)
    service=${service##*/}
    VERSION_TO_DOWNLOAD=$(curl -s "https://api.github.com/repos/CatalystCode/spk/releases/latest" | grep "tag_name" | sed -E 's/.*"([^"]+)".*/\1/')
    echo "Downloading SPK version $VERSION_TO_DOWNLOAD" && wget "https://github.com/CatalystCode/spk/releases/download/$VERSION_TO_DOWNLOAD/spk-linux"
    chmod +x ./spk-linux
    ./spk-linux deployment create -n $(ACCOUNT_NAME) -k $(ACCOUNT_KEY) -t $(TABLE_NAME) -p $(PARTITION_KEY) --p1 $(Build.BuildId) --image-tag $tag_name --commit-id $commitId --service $service

  displayName: Update manifest pipeline details in Spektate db
```

This task will update the service introspection storage table for every build
that runs from the source repository. This information will be available for use
by service introspection.

##### Note:

- Make sure the variable `tag_name` is set to the tag name for the image being
  built in your docker step.

- Add the task before the crucial steps in your pipeline. This will capture
  details about failures if the important steps fail.

#### 3. CD release pipeline (ACR to HLD) configuration

The CD release pipeline updates the docker image number in the HLD.

If you are not using multi-stage pipelines, paste the following task towards the end of your release step in the release
pipeline:

```yaml
latest_commit=$(git rev-parse --short HEAD)
VERSION_TO_DOWNLOAD=$(curl -s "https://api.github.com/repos/CatalystCode/spk/releases/latest" | grep "tag_name" | sed -E 's/.*"([^"]+)".*/\1/') 
echo "Downloading SPK version $VERSION_TO_DOWNLOAD" && wget "https://github.com/CatalystCode/spk/releases/download/$VERSION_TO_DOWNLOAD/spk-linux"
chmod +x ./spk-linux
./spk-linux deployment create  -n $(ACCOUNT_NAME) -k $(ACCOUNT_KEY) -t $(TABLE_NAME) -p $(PARTITION_KEY)  --p2 $(Release.ReleaseId) --hld-commit-id $latest_commit --env $(Release.EnvironmentName) --image-tag $(Build.BuildId)
```

This task is similar to the one from step 1 but instead passes the information
that corresponds to the CD release pipeline.

For multi-stage pipelines, paste the following yaml task towards the end of your image tag release stage:

```yaml
latest_commit=$(git rev-parse --short HEAD)
tag_name=$(Build.BuildId)
VERSION_TO_DOWNLOAD=$(curl -s "https://api.github.com/repos/CatalystCode/spk/releases/latest" | grep "tag_name" | sed -E 's/.*"([^"]+)".*/\1/') 
echo "Downloading SPK version $VERSION_TO_DOWNLOAD" && wget "https://github.com/CatalystCode/spk/releases/download/$VERSION_TO_DOWNLOAD/spk-linux"
chmod +x ./spk-linux
./spk-linux deployment create  -n $(ACCOUNT_NAME) -k $(ACCOUNT_KEY) -t $(TABLE_NAME) -p $(PARTITION_KEY)  --p2 $(Build.BuildId) --hld-commit-id $latest_commit --env $(Build.SourceBranchName) --image-tag $tag_name
```

Make sure your variable `tag_name` in this script matches the `tag_name` in the source build pipeline step above. 

#### 4. HLD manifest pipeline configuration

The HLD manifest pipeline builds the HLD using `fabrikate` and generates
resource manifests that are then placed in the resource manifest repository.

Paste the following task in the `azure-pipelines.yml` file **after** the
`fabrikate` steps:

```yaml
- bash: |
    cd "$HOME"/<name of your manifest repository>
    commitId=$(Build.SourceVersion)
    commitId=$(echo "${commitId:0:7}")
    latest_commit=$(git rev-parse --short HEAD)
    VERSION_TO_DOWNLOAD=$(curl -s "https://api.github.com/repos/CatalystCode/spk/releases/latest" | grep "tag_name" | sed -E 's/.*"([^"]+)".*/\1/')
    echo "Downloading SPK version $VERSION_TO_DOWNLOAD" && wget "https://github.com/CatalystCode/spk/releases/download/$VERSION_TO_DOWNLOAD/spk-linux"
    chmod +x ./spk-linux
    ./spk-linux deployment create -n $(ACCOUNT_NAME) -k $(ACCOUNT_KEY) -t $(TABLE_NAME) -p $(PARTITION_KEY) --p3 $(Build.BuildId) --hld-commit-id $commitId --manifest-commit-id $latest_commit
  displayName: Update manifest pipeline details in Spektate db
```

## Getting started

After completing the steps in this guide, you should be able to:

- Fill out the `azure_devops` and `introspection` settings in
  [`spk-config.yaml`](https://github.com/CatalystCode/spk/blob/master/spk-config.yaml)
  so that you can use service introspection. More information about `spk` config
  can be found on the [main page](https://github.com/catalystcode/spk).

- Validate and verify the `spk-config.yaml` settings and the service
  introspection storage using
  [`spk deployment validate`](https://github.com/CatalystCode/spk/blob/master/docs/service-introspection.md#validate)

- Get information about your deployment using
  [`spk deployment get`](https://github.com/CatalystCode/spk/blob/master/docs/service-introspection.md#get)

- Launch the dashboard to visualize the data using
  [`spk deployment dashboard`](https://github.com/CatalystCode/spk/blob/master/docs/service-introspection.md#dashboard)
